const express = require('express');

const { listPosts, getPostBySlug, collectTags } = require('../utils/postStore');
const { buildRssFeed } = require('../utils/rss');
const { siteUrl, blogTitle } = require('../config');

const router = express.Router();

router.get('/posts', async (req, res, next) => {
    try {
        const { search, tag } = req.query;
        const posts = await listPosts({ search, tag });
        res.json({ posts });
    } catch (error) {
        next(error);
    }
});

router.get('/posts/:slug/raw', async (req, res, next) => {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: false });
        if (!post || post.status !== 'published') {
            return res.status(404).json({ error: 'not found' });
        }
        res.type('text/markdown').send(post.markdown);
    } catch (error) {
        next(error);
    }
});

router.get('/posts/:slug', async (req, res, next) => {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: false });
        if (!post || post.status !== 'published') {
            return res.status(404).json({ error: 'not found' });
        }
        res.json({
            post: {
                slug: post.slug,
                title: post.title,
                tags: post.tags,
                createdAt: post.createdAt,
                updatedAt: post.updatedAt,
                publishedAt: post.publishedAt,
                excerpt: post.excerpt,
                html: post.html,
            },
        });
    } catch (error) {
        next(error);
    }
});

router.get('/tags', async (req, res, next) => {
    try {
        const tags = await collectTags();
        res.json({ tags });
    } catch (error) {
        next(error);
    }
});

router.get('/rss.xml', async (req, res, next) => {
    try {
        const posts = await listPosts();
        const hydrated = await Promise.all(posts
            .filter((post) => post.status === 'published')
            .map((post) => getPostBySlug(post.slug)));
        const xml = buildRssFeed({
            siteUrl,
            blogTitle,
            posts: hydrated.filter(Boolean),
        });
        res.type('application/rss+xml').send(xml);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
