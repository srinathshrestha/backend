const express = require('express');

const authRequired = require('../middleware/authRequired');
const {
    STATUSES,
    listPosts,
    getPostBySlug,
    createPost,
    updatePost,
    deletePost,
} = require('../utils/postStore');
const { renderMarkdown } = require('../utils/markdown');

const router = express.Router();

router.use(authRequired);

router.get('/posts', async (req, res, next) => {
    try {
        const { status, search } = req.query;
        const includeDrafts = true;
        let posts = await listPosts({ includeDrafts, search });
        if (status && (status === STATUSES.DRAFT || status === STATUSES.PUBLISHED)) {
            posts = posts.filter((post) => post.status === status);
        }
        res.json({ posts });
    } catch (error) {
        next(error);
    }
});

router.get('/posts/:slug', async (req, res, next) => {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: true });
        if (!post) {
            return res.status(404).json({ error: 'not found' });
        }
        return res.json({ post });
    } catch (error) {
        return next(error);
    }
});

router.post('/posts', async (req, res, next) => {
    try {
        const { title, markdown, tags, status, slug } = req.body || {};
        if (!title || !markdown) {
            return res.status(400).json({ error: 'title and markdown required' });
        }
        const post = await createPost({ title, markdown, tags, status, slug });
        return res.status(201).json({ post });
    } catch (error) {
        if (/Slug /.test(error.message)) {
            error.status = 409;
        }
        return next(error);
    }
});

router.put('/posts/:slug', async (req, res, next) => {
    try {
        const { title, markdown, tags, status, slug } = req.body || {};
        const post = await updatePost(req.params.slug, { title, markdown, tags, status, slug });
        return res.json({ post });
    } catch (error) {
        if (/Slug /.test(error.message)) {
            error.status = 409;
        }
        return next(error);
    }
});

router.delete('/posts/:slug', async (req, res, next) => {
    try {
        await deletePost(req.params.slug);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

router.post('/render', (req, res) => {
    const { markdown = '' } = req.body || {};
    res.json({ html: renderMarkdown(markdown) });
});

module.exports = router;
