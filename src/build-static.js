'use strict';

const path = require('path');
const fs = require('fs/promises');
const ejs = require('ejs');
const {
    siteUrl,
    blogTitle,
    closeDatabase,
    ensureDb,
    listPosts,
    getPostBySlug,
    buildRssFeed,
} = require('./app');

const ROOT = path.join(__dirname, '..');
const VIEWS_DIR = path.join(ROOT, 'views');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

async function mkdirFor(file) {
    await fs.mkdir(path.dirname(file), { recursive: true });
}

async function write(file, content) {
    await mkdirFor(file);
    await fs.writeFile(file, content);
}

async function render(template, data) {
    return ejs.renderFile(path.join(VIEWS_DIR, template), {
        blogTitle,
        theme: 'light',
        ...data,
    }, {
        root: VIEWS_DIR,
        views: [VIEWS_DIR],
    });
}

async function main() {
    await ensureDb();

    const posts = await listPosts();
    const detailedPosts = [];
    for (const post of posts) {
        const detailed = await getPostBySlug(post.slug);
        if (!detailed) continue;
        detailedPosts.push(detailed);
    }

    await fs.rm(DIST_DIR, { recursive: true, force: true });
    await fs.mkdir(DIST_DIR, { recursive: true });
    await fs.cp(PUBLIC_DIR, DIST_DIR, { recursive: true });

    await write(
        path.join(DIST_DIR, 'index.html'),
        await render('portfolio.ejs', { title: blogTitle }),
    );
    await write(
        path.join(DIST_DIR, 'portfolio', 'index.html'),
        await render('portfolio.ejs', { title: blogTitle }),
    );
    await write(
        path.join(DIST_DIR, 'blogs', 'index.html'),
        await render('index.ejs', { title: `Writing · ${blogTitle}`, posts }),
    );
    await write(
        path.join(DIST_DIR, '404.html'),
        await render('404.ejs', { title: 'Not found' }),
    );

    for (const post of detailedPosts) {
        const idx = posts.findIndex((p) => p.slug === post.slug);
        const prevPost = idx < posts.length - 1 ? posts[idx + 1] : null;
        const nextPost = idx > 0 ? posts[idx - 1] : null;
        await write(
            path.join(DIST_DIR, 'blogs', post.slug, 'index.html'),
            await render('post.ejs', { title: post.title, post, prevPost, nextPost, isPreview: false }),
        );
    }

    await write(path.join(DIST_DIR, 'rss.xml'), buildRssFeed(detailedPosts));

    console.log(`[rawdog-blog] wrote ${detailedPosts.length} post page${detailedPosts.length === 1 ? '' : 's'} to ${path.relative(ROOT, DIST_DIR)}`);
    console.log(`[rawdog-blog] static site URL base: ${siteUrl}`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDatabase();
    });
