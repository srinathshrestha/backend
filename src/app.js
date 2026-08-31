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
// Gates /preview/:slug. Unset means the route is unreachable — a blank
// admin config file must never accidentally expose every draft.
const previewToken = process.env.PREVIEW_TOKEN || '';

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
    const info = String(infostring || '').trim();
    const first = info.split(/\s+/)[0];
    const [rawLang = '', rawFile = ''] = first.split(':', 2);
    const lang = String(rawLang || '').toLowerCase().replace(/[^a-z0-9#+.\-_]/g, '');

    // Mermaid gets no code styling at all — mermaid.js reads the raw diagram
    // text out of a bare `<pre class="mermaid">` and replaces it with SVG, so
    // the filename header, language tag and code-container wrapper below
    // would just be scaffolding it immediately throws away.
    if (lang === 'mermaid') return `<pre class="mermaid">${esc(code)}</pre>\n`;

    const original = baseRenderer.code.call(this, code, infostring, escaped);
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

// A task-list `<li>` renders its checkbox first — the default renderer gives
// no hook to tell those apart from an ordinary item, so this checks for the
// `<input>` the checkbox renderer already produced and tags the line for CSS
// (no bullet, checkbox sits where the bullet would).
renderer.listitem = (text) =>
    /^<input\s/.test(text.trim()) ? `<li class="task-list-item">${text}</li>\n` : `<li>${text}</li>\n`;

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

// `$...$` and `$$...$$` are pulled out before ordinary inline/block parsing
// ever sees them, and handed to the renderer as inert text in a `data-math`
// attribute. Left alone, an expression like `$x_i * y_i$` would have its `_`
// and `*` read as emphasis markers by the rest of the pipeline; wrapping it
// here means marked never gets the chance. The client only has to read the
// attribute back out and hand it to KaTeX — see public/post-enhance.js.
const blockMathExt = {
    name: 'blockMath',
    level: 'block',
    start: (src) => src.match(/\$\$/)?.index,
    tokenizer(src) {
        const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
        if (m) return { type: 'blockMath', raw: m[0], text: m[1].trim() };
    },
    renderer: (t) => `<div class="math math-display" data-math="${esc(t.text)}">$$${esc(t.text)}$$</div>\n`,
};

const inlineMathExt = {
    name: 'inlineMath',
    level: 'inline',
    start: (src) => src.indexOf('$'),
    tokenizer(src) {
        // No whitespace touching either `$`, and the closing one isn't
        // immediately followed by a digit — keeps plain prices like "$5 or
        // $10" from being read as math.
        const m = /^\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)/.exec(src);
        if (m) return { type: 'inlineMath', raw: m[0], text: m[1] };
    },
    renderer: (t) => `<span class="math math-inline" data-math="${esc(t.text)}">$${esc(t.text)}$</span>`,
};

// The slug index a wikilink resolves against for the post currently being
// rendered. Set synchronously right before `marked.parse` and cleared right
// after in `renderMarkdown` — safe because nothing in that stretch awaits,
// so no other request's render can interleave and see the wrong index.
let currentSlugIndex = null;

function resolveWikilink(target) {
    if (!currentSlugIndex) return null;
    const bySlug = slugify(target, { lower: true, strict: true });
    if (currentSlugIndex.bySlug.has(bySlug)) return currentSlugIndex.bySlug.get(bySlug);
    const slug = currentSlugIndex.byTitle.get(target.trim().toLowerCase());
    return slug ? currentSlugIndex.bySlug.get(slug) : null;
}

// `![[file.png]]` / `![[file.png|caption]]` — an image embed, sugar for the
// normal `![caption](/uploads/file.png)` and rendered through the same
// `renderer.image` so sizing/alignment/caption syntax stays one thing to
// remember. Must be tried before `wikilinkExt` or `![[x]]` would parse as a
// broken link with a stray leading `!`.
const wikiEmbedExt = {
    name: 'wikiEmbed',
    level: 'inline',
    start: (src) => src.indexOf('![['),
    tokenizer(src) {
        const m = /^!\[\[([^\]|]+)(?:\|([^\]]+))?]]/.exec(src);
        if (m) return { type: 'wikiEmbed', raw: m[0], file: m[1].trim(), caption: m[2] ? m[2].trim() : '' };
    },
    renderer(t) {
        return renderer.image(`/uploads/${t.file}`, '', t.caption || t.file);
    },
};

// `[[Post Title]]` / `[[slug|label]]` — links to another post, resolved by
// slug first and then by a case-insensitive title match. A target that
// matches nothing renders as plain (but visibly marked) text rather than a
// link to a 404 — this runs on drafts too, where the other post may not be
// slugged yet.
const wikilinkExt = {
    name: 'wikilink',
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenizer(src) {
        const m = /^(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?]]/.exec(src);
        if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim(), label: m[2] ? m[2].trim() : null };
    },
    renderer(t) {
        const resolved = resolveWikilink(t.target);
        const label = esc(t.label || (resolved && resolved.title) || t.target);
        if (!resolved) return `<span class="wikilink-broken" title="No matching post">${label}</span>`;
        return `<a href="/blogs/${resolved.slug}" class="wikilink">${label}</a>`;
    },
};

marked.use({
    mangle: false,
    headerIds: false,
    gfm: true,
    breaks: true,
    renderer,
    extensions: [highlightExt, footnoteRefExt, blockMathExt, inlineMathExt, wikiEmbedExt, wikilinkExt],
});

// `slugIndex` (see `getSlugIndex`) drives `[[wikilink]]` resolution. Optional
// so callers that don't need it — tests, excerpts — don't have to fetch one.
function renderMarkdown(md, slugIndex) {
    const footnotes = {};
    const cleaned = String(md || '').replace(/^\[\^([^\]]+)]:\s+(.+)$/gm, (_, id, content) => {
        footnotes[id] = content;
        return '';
    });
    currentSlugIndex = slugIndex || null;
    let html;
    try {
        html = marked.parse(cleaned);
        const ids = Object.keys(footnotes);
        if (ids.length) {
            const items = ids.map((id) => {
                const safeId = esc(id);
                return `<li id="fn-${safeId}"><span>${marked.parseInline(footnotes[id] || '')}</span> `
                    + `<a href="#fnref-${safeId}" class="fn-backref" title="Back to text">↩</a></li>`;
            }).join('\n');
            html += `\n<section class="footnotes"><hr><ol>\n${items}\n</ol></section>`;
        }
    } finally {
        currentSlugIndex = null;
    }
    return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

// Which optional client-side renderers a post actually needs, so post.ejs
// only pulls in the (self-hosted, but not free) KaTeX/Mermaid/highlight.js
// bundles when the markdown asked for them. A plain text post stays exactly
// as plain as it always was.
function detectFeatures(html) {
    return {
        hasMath: /class="math /.test(html),
        hasMermaid: /class="mermaid"/.test(html),
        hasCode: /<code class="language-/.test(html),
    };
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

// slug/title lookup for `[[wikilink]]` resolution, cached briefly so a page
// of post links doesn't mean a query per link. Two independent entries
// (published-only vs. everything) rather than one flag on a shared cache —
// a preview resolving links against drafts must never leak into what a
// public request's cache serves next.
const SLUG_INDEX_TTL_MS = 30000;
const slugIndexCache = { pub: null, all: null };

async function getSlugIndex(includeDrafts) {
    const key = includeDrafts ? 'all' : 'pub';
    const cached = slugIndexCache[key];
    if (cached && Date.now() - cached.at < SLUG_INDEX_TTL_MS) return cached.data;

    const filter = includeDrafts ? {} : { status: PUBLISHED };
    const docs = await postsCol().find(filter, { projection: { slug: 1, title: 1 } }).toArray();
    const bySlug = new Map();
    const byTitle = new Map();
    for (const d of docs) {
        bySlug.set(d.slug, { slug: d.slug, title: d.title });
        byTitle.set(String(d.title || '').trim().toLowerCase(), d.slug);
    }
    const data = { bySlug, byTitle };
    slugIndexCache[key] = { data, at: Date.now() };
    return data;
}

function toRenderedPost(doc, slugIndex) {
    const html = renderMarkdown(doc.markdown || '', slugIndex);
    return { ...mapList(doc), html, ...detectFeatures(html) };
}

async function getPostBySlug(slug) {
    const doc = await postsCol().findOne({ slug: slug.trim().toLowerCase(), status: PUBLISHED });
    if (!doc) return null;
    return toRenderedPost(doc, await getSlugIndex(false));
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
        res.render('post', { title: post.title, post, prevPost, nextPost, isPreview: false });
    } catch (e) {
        next(e);
    }
});

// Renders a post through the exact same pipeline as `/blogs/:slug`,
// regardless of status — the only way to see a draft (or an unpublished edit
// to a live post) exactly as readers eventually will. Gated by a bearer
// token in the query string rather than session auth: the TUI has no
// session, only a shared secret in its config file next to the one this
// route reads from the environment. Never cached, never counted as a view,
// never indexed — it must not become a second, quieter way to read drafts.
app.get('/preview/:slug', ensureDbConnection, async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.set('X-Robots-Tag', 'noindex, nofollow');

        const given = Buffer.from(String(req.query.token || ''));
        const expected = Buffer.from(previewToken);
        const authorized = previewToken.length > 0
            && given.length === expected.length
            && crypto.timingSafeEqual(given, expected);
        if (!authorized) return res.status(404).render('404', { title: 'Not found' });

        const doc = await postsCol().findOne({ slug: req.params.slug.trim().toLowerCase() });
        if (!doc) return res.status(404).render('404', { title: 'Not found' });
        const post = toRenderedPost(doc, await getSlugIndex(true));
        res.render('post', {
            title: `[preview] ${post.title}`,
            post,
            prevPost: null,
            nextPost: null,
            isPreview: true,
        });
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

module.exports = {
    app,
    port,
    siteUrl,
    blogTitle,
    closeDatabase,
    ensureDb,
    listPosts,
    getPostBySlug,
    buildRssFeed,
    renderMarkdown,
};
