'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const express = require('express');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const { marked } = require('marked');
const matter = require('gray-matter');
const slugify = require('slugify');

// ── Config ───────────────────────────────────────────────────
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });

const port = parseInt(process.env.PORT, 10) || 3000;
const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
const blogTitle = process.env.BLOG_TITLE || 'Srinath Shrestha';
const mongodbUri = process.env.MONGODB_URI;
const mongodbDbName = process.env.MONGODB_DB_NAME || 'myblogs';
if (!mongodbUri) throw new Error('MONGODB_URI must be set');

const ROOT = path.join(__dirname, '..');
const VIEWS_DIR = path.join(ROOT, 'views');
const PUBLIC_DIR = path.join(ROOT, 'public');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const PUBLISHED = 'published';
const BOT_RE = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegram/i;
const THEME_COOKIE = 'raw_theme';
const THEME_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

// ── Small helpers ────────────────────────────────────────────
const esc = (s = '') =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escXml = (s = '') =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toDate(v, fallback) {
    if (!v) return fallback;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? fallback : d;
}

function iso(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapList(doc) {
    return {
        slug: doc.slug,
        title: doc.title,
        status: doc.status,
        tags: doc.tags || [],
        createdAt: iso(doc.createdAt),
        updatedAt: iso(doc.updatedAt),
        publishedAt: iso(doc.publishedAt),
        excerpt: doc.excerpt || '',
    };
}

function buildExcerpt(md = '', maxWords = 40) {
    const plain = md
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[[^\]]*]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
        .replace(/[#>*_~\-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plain) return '';
    const words = plain.split(' ');
    return words.length <= maxWords ? plain : `${words.slice(0, maxWords).join(' ')}…`;
}

function normalizeTheme(v) {
    return v === 'dark' ? 'dark' : 'light';
}

function readTheme(req) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k !== THEME_COOKIE) continue;
        try {
            return normalizeTheme(decodeURIComponent(rest.join('=') || ''));
        } catch {
            return normalizeTheme(rest.join('=') || '');
        }
    }
    return 'light';
}

function setThemeCookie(res, theme) {
    res.cookie(THEME_COOKIE, normalizeTheme(theme), { maxAge: THEME_MAX_AGE, sameSite: 'lax', path: '/' });
}

function isPrefetch(req) {
    const purpose = String(req.get('Sec-Purpose') || req.get('Purpose') || '').toLowerCase();
    if (purpose.includes('prefetch') || purpose.includes('prerender')) return true;
    if (req.get('X-Moz') === 'prefetch' || req.get('X-Raw-Prefetch') === '1') return true;
    const q = req.query || {};
    return q._prefetch === '1' || q.prefetch === '1';
}

function htmlCache(res) {
    res.set('Cache-Control', 'private, max-age=180, stale-while-revalidate=600');
}

function redirectBack(req) {
    const referrer = req.get('referer');
    if (!referrer) return '/';
    try {
        const url = new URL(referrer, `${req.protocol}://${req.get('host')}`);
        if (url.host !== req.get('host')) return '/';
        return `${url.pathname}${url.search}${url.hash}` || '/';
    } catch {
        return '/';
    }
}

// ── Markdown ─────────────────────────────────────────────────
function sanitizeImg(src = '') {
    const t = String(src || '').trim();
    if (!t) return '';
    if (/^data:image\//i.test(t) || /^https?:\/\//i.test(t) || /^\/uploads\//i.test(t)) return t;
    return '';
}

const baseRenderer = new marked.Renderer();
const renderer = new marked.Renderer();

renderer.blockquote = (quote) => {
    const match = quote.match(/^<p>\[!(note|tip|warning|important|caution)]\s*/i);
    if (!match) return `<blockquote>${quote}</blockquote>\n`;
    const type = match[1].toLowerCase();
    const rest = quote.slice(match[0].length);
    const breakIdx = rest.search(/<br\s*\/?>|<\/p>/);
    const title = (breakIdx > 0 ? rest.slice(0, breakIdx) : rest.replace(/<\/p>[\s\S]*$/, '')).trim()
        || type[0].toUpperCase() + type.slice(1);
    let body = breakIdx > 0 ? rest.slice(breakIdx).replace(/^<br\s*\/?>/, '') : '';
    body = body.trim();
    return `<div class="callout callout-${type}"><div class="callout-title"><span>${title}</span></div>`
        + (body ? `<div class="callout-body">${body}</div>` : '') + `</div>\n`;
};

renderer.heading = (text, level, raw, slugger) => {
    const slug = slugger.slug(raw);
    return `<h${level} id="${slug}"><a class="heading-anchor" href="#${slug}" aria-hidden="true">#</a>${text}</h${level}>\n`;
};

renderer.code = function (code, infostring, escaped) {
    const original = baseRenderer.code.call(this, code, infostring, escaped);
    const info = String(infostring || '').trim();
    const first = info.split(/\s+/)[0];
    const [rawLang = '', rawFile = ''] = first.split(':', 2);
    const lang = String(rawLang || '').toLowerCase().replace(/[^a-z0-9#+.\-_]/g, '');
    const file = esc(String(rawFile || '').slice(0, 160));
    if (!lang) {
        if (file) {
            return original
                .replace('<pre>', `<div class="code-container"><div class="code-filename" title="${file}">${file}</div><pre class="code-block">`)
                .replace('</pre>', '</pre></div>');
        }
        return original.replace('<pre>', '<pre class="code-block">');
    }
    const fileHeader = file ? `<div class="code-filename" title="${file}">${file}</div>` : '';
    return original
        .replace('<pre>', `<div class="code-container">${fileHeader}<span class="code-language">${lang}</span><pre class="code-block language-${lang}">`)
        .replace('</pre>', '</pre></div>');
};

renderer.table = (header, body) =>
    `<div class="table-wrap"><table>\n<thead>\n${header}</thead>\n${body ? `<tbody>\n${body}</tbody>\n` : ''}</table></div>\n`;

renderer.image = (src, title, text) => {
    let actual = typeof src === 'string' ? src : (src && src.href) || String(src || '');
    const safe = sanitizeImg(actual);
    if (!safe) return text ? esc(String(text || '')) : '';
    const parts = String(text || '').split('|').map((s) => s.trim());
    const alt = esc(parts[0] || '');
    const width = /^\d+$/.test(parts[1] || '') ? parseInt(parts[1], 10) : 0;
    const alignRaw = (parts[2] || '').toLowerCase();
    const align = alignRaw === 'left' || alignRaw === 'right' ? alignRaw : '';
    const titleAttr = title ? ` title="${esc(String(title || ''))}"` : '';
    const style = width ? ` style="max-width:${width}px; width:100%"` : '';
    const cls = align ? ` img-${align}` : '';
    const caption = (parts[0] || '').replace(/_/g, ' ').trim();
    const img = `<img src="${safe}" alt="${alt}"${titleAttr}${style} class="post-img${cls}" loading="lazy" />`;
    if (caption) return `<figure class="post-figure${cls}">${img}<figcaption>${esc(caption)}</figcaption></figure>`;
    return img;
};

const highlightExt = {
    name: 'highlight',
    level: 'inline',
    start: (src) => src.indexOf('=='),
    tokenizer(src) {
        const m = /^==(?!=)(.+?)(?<!=)==/.exec(src);
        if (m) return { type: 'highlight', raw: m[0], text: m[1] };
    },
    renderer: (t) => `<mark>${esc(t.text)}</mark>`,
};

const footnoteRefExt = {
    name: 'footnoteRef',
    level: 'inline',
    start: (src) => src.indexOf('[^'),
    tokenizer(src) {
        const m = /^\[\^([^\]]+)](?!:)/.exec(src);
        if (m) return { type: 'footnoteRef', raw: m[0], id: m[1] };
    },
    renderer(t) {
        const id = esc(t.id);
        return `<sup class="fn-ref"><a href="#fn-${id}" id="fnref-${id}">[${id}]</a></sup>`;
    },
};

marked.use({
    mangle: false,
    headerIds: false,
    gfm: true,
    breaks: true,
    renderer,
    extensions: [highlightExt, footnoteRefExt],
});

function renderMarkdown(md) {
    const footnotes = {};
    const cleaned = String(md || '').replace(/^\[\^([^\]]+)]:\s+(.+)$/gm, (_, id, content) => {
        footnotes[id] = content;
        return '';
    });
    let html = marked.parse(cleaned);
    const ids = Object.keys(footnotes);
    if (ids.length) {
        const items = ids.map((id) => {
            const safeId = esc(id);
            return `<li id="fn-${safeId}"><span>${marked.parseInline(footnotes[id] || '')}</span> `
                + `<a href="#fnref-${safeId}" class="fn-backref" title="Back to text">↩</a></li>`;
        }).join('\n');
        html += `\n<section class="footnotes"><hr><ol>\n${items}\n</ol></section>`;
    }
    return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

// ── Database + posts ─────────────────────────────────────────
let client;
let database;
let dbReady;

async function importFromFilesystem(db) {
    const col = db.collection('posts');
    if ((await col.estimatedDocumentCount()) > 0) return;
    let entries;
    try {
        entries = await fs.readdir(POSTS_DIR);
    } catch (e) {
        if (e.code === 'ENOENT') return;
        throw e;
    }
    const docs = [];
    for (const name of entries.filter((n) => n.endsWith('.md'))) {
        const raw = await fs.readFile(path.join(POSTS_DIR, name), 'utf8');
        const { data: fm = {}, content } = matter(raw);
        const baseSlug = fm.slug || path.basename(name, path.extname(name));
        const markdown = content.trim();
        const createdAt = toDate(fm.createdAt, new Date());
        const tags = !fm.tags ? [] : (Array.isArray(fm.tags) ? fm.tags : String(fm.tags).split(','))
            .map((t) => String(t).trim().toLowerCase()).filter(Boolean);
        docs.push({
            slug: slugify(baseSlug, { lower: true, strict: true }),
            title: fm.title || baseSlug,
            markdown,
            tags,
            status: PUBLISHED,
            createdAt,
            updatedAt: toDate(fm.updatedAt, createdAt),
            publishedAt: toDate(fm.publishedAt, createdAt),
            excerpt: fm.excerpt || buildExcerpt(markdown),
        });
    }
    if (!docs.length) return;
    await col.insertMany(docs);
    console.log(`[rawdog-blog] imported ${docs.length} markdown post${docs.length === 1 ? '' : 's'} from filesystem`);
}

async function connectToDatabase() {
    if (database) return database;
    client = new MongoClient(mongodbUri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    database = client.db(mongodbDbName);
    await database.collection('posts').createIndex({ slug: 1 }, { unique: true });
    await database.collection('posts').createIndex({ status: 1, publishedAt: -1 });
    await database.collection('pageviews').createIndex({ slug: 1, ts: -1 });
    await database.collection('pageviews').createIndex({ ts: -1 });
    await importFromFilesystem(database);
    console.log(`[rawdog-blog] connected to MongoDB database "${mongodbDbName}"`);
    return database;
}

function getDb() {
    if (!database) throw new Error('Database has not been initialised. Call connectToDatabase() first.');
    return database;
}

async function closeDatabase() {
    if (client) {
        await client.close();
        client = null;
        database = null;
        dbReady = null;
    }
}

function ensureDb() {
    if (!dbReady) {
        dbReady = connectToDatabase().catch((err) => {
            dbReady = null;
            throw err;
        });
    }
    return dbReady;
}

async function ensureDbConnection(req, res, next) {
    try {
        await ensureDb();
        next();
    } catch (err) {
        next(err);
    }
}

function postsCol() {
    return getDb().collection('posts');
}

async function listPosts() {
    const docs = await postsCol()
        .find({ status: PUBLISHED }, { projection: { markdown: 0 }, sort: { publishedAt: -1, updatedAt: -1 } })
        .toArray();
    return docs.map(mapList);
}

async function getPostBySlug(slug) {
    const doc = await postsCol().findOne({ slug: slug.trim().toLowerCase(), status: PUBLISHED });
    if (!doc) return null;
    return { ...mapList(doc), html: renderMarkdown(doc.markdown || '') };
}

function recordView(slug, req) {
    const ua = req.headers['user-agent'] || '';
    if (BOT_RE.test(ua)) return;
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '';
    let referrer = null;
    const ref = req.headers.referer || req.headers.referrer;
    if (ref && ref !== 'undefined') {
        try {
            const u = new URL(ref);
            referrer = `${u.hostname}${u.pathname}`.slice(0, 200);
        } catch { /* ignore */ }
    }
    getDb().collection('pageviews').insertOne({
        slug,
        ts: new Date(),
        ipHash: crypto.createHash('sha256').update(ip || '').digest('hex').slice(0, 16),
        referrer,
    }).catch(() => {});
}

function buildRssFeed(posts) {
    const items = posts
        .filter((p) => p.status === 'published')
        .map((post) => {
            const url = `${siteUrl.replace(/\/$/, '')}/blogs/${post.slug}`;
            const pubDate = post.publishedAt
                ? new Date(post.publishedAt).toUTCString()
                : new Date(post.updatedAt).toUTCString();
            return `    <item>
      <title>${escXml(post.title)}</title>
      <link>${escXml(url)}</link>
      <guid>${escXml(url)}</guid>
      <pubDate>${escXml(pubDate)}</pubDate>
      <description>${escXml(post.excerpt || '')}</description>
      <content:encoded><![CDATA[${post.html || ''}]]></content:encoded>
    </item>`;
        })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escXml(blogTitle)}</title>
    <link>${escXml(siteUrl)}</link>
    <description>${escXml('rawdog dev notes')}</description>
${items}
  </channel>
</rss>`;
}

// ── Express app ──────────────────────────────────────────────
const app = express();
app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);
app.disable('x-powered-by');
app.use(express.static(PUBLIC_DIR, { etag: true, lastModified: true, maxAge: '1d', immutable: false }));
app.use((req, res, next) => {
    res.locals.blogTitle = blogTitle;
    res.locals.theme = readTheme(req);
    next();
});

app.get('/health', (req, res) => res.type('application/json').send({ ok: true }));

app.get('/', (req, res) => {
    htmlCache(res);
    res.render('portfolio', { title: blogTitle });
});

app.get('/portfolio', (req, res) => res.redirect(301, '/'));

app.get('/theme/:theme', (req, res) => {
    res.set('Cache-Control', 'no-store');
    setThemeCookie(res, normalizeTheme(req.params.theme));
    res.redirect(303, redirectBack(req));
});

app.get('/resume', (req, res) => {
    res.download(path.join(PUBLIC_DIR, 'resume', 'srinathShresthaResume.pdf'), 'SrinathShresthaResume.pdf', (err) => {
        if (err) {
            console.error(err);
            if (!res.headersSent) res.status(500).send('Error downloading resume');
        }
    });
});

app.get('/blogs', ensureDbConnection, async (req, res, next) => {
    try {
        const posts = await listPosts();
        htmlCache(res);
        res.render('index', { title: `Writing · ${blogTitle}`, posts });
    } catch (e) {
        next(e);
    }
});

app.get('/blogs/:slug', ensureDbConnection, async (req, res, next) => {
    try {
        const post = await getPostBySlug(req.params.slug);
        if (!post) return res.status(404).render('404', { title: 'Not found' });
        if (!isPrefetch(req)) recordView(post.slug, req);
        const all = await listPosts();
        const idx = all.findIndex((p) => p.slug === post.slug);
        const prevPost = idx < all.length - 1 ? all[idx + 1] : null;
        const nextPost = idx > 0 ? all[idx - 1] : null;
        htmlCache(res);
        res.render('post', { title: post.title, post, prevPost, nextPost });
    } catch (e) {
        next(e);
    }
});

app.get('/rss.xml', ensureDbConnection, async (req, res, next) => {
    try {
        const posts = await listPosts();
        const detailed = await Promise.all(posts.map((p) => getPostBySlug(p.slug)));
        res.type('application/rss+xml').send(buildRssFeed(detailed.filter(Boolean)));
    } catch (e) {
        next(e);
    }
});

app.use((req, res) => res.status(404).render('404', { title: 'Not found' }));

app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    const message = err.message || 'internal server error';
    if (req.accepts('html')) {
        const template = status >= 500 ? '500' : status === 404 ? '404' : 'error';
        const title = status >= 500 ? 'Server error' : status === 404 ? 'Not found' : 'Error';
        return res.status(status).render(template, { title, message, status });
    }
    if (req.accepts('json')) return res.status(status).json({ error: message });
    return res.status(status).type('text/plain').send(message);
});

module.exports = { app, port, siteUrl, closeDatabase };
