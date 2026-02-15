// ── Admin post handlers ──────────────────────────────────────
// Show, save, and delete blog posts from the admin dashboard.

const { listPosts, getPostBySlug, createPost, updatePost, deletePost } = require('../utils/postStore');
const { renderMarkdown } = require('../utils/markdown');

async function showAdminLogin(req, res) {
    if (res.locals.isAuthenticated) return res.redirect('/admin/posts');
    res.render('admin/login', { title: `Login · ${res.locals.blogTitle}`, error: null });
}

function splitPosts(posts = []) {
    const published = [];
    const drafts = [];
    posts.forEach((p) => (p.status === 'published' ? published : drafts).push(p));
    return { published, drafts };
}

async function showAdminPosts(req, res, next) {
    try {
        const posts = await listPosts({ includeDrafts: true });
        const { published, drafts } = splitPosts(posts);
        res.render('admin/posts', { title: `Posts · ${res.locals.blogTitle}`, published, drafts });
    } catch (err) { next(err); }
}

function showNewPost(req, res) {
    res.render('admin/edit', {
        title: `New Post · ${res.locals.blogTitle}`,
        post: null, previewHtml: '', message: null,
    });
}

async function showEditPost(req, res, next) {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: true });
        if (!post) return res.status(404).render('404', { title: 'Not found' });
        res.render('admin/edit', {
            title: `Edit ${post.title} · ${res.locals.blogTitle}`,
            post, previewHtml: post.html, message: req.query.message || null,
        });
    } catch (err) { next(err); }
}

async function previewMarkdown(req, res, next) {
    try {
        res.json({ html: renderMarkdown(req.body.markdown || '') });
    } catch (err) { next(err); }
}

async function savePost(req, res, next) {
    const { originalSlug, title, slug, tags, markdown, action } = req.body;
    const status = action === 'publish' ? 'published' : 'draft';
    try {
        const saved = originalSlug
            ? await updatePost(originalSlug, { title, slug, tags, markdown, status })
            : await createPost({ title, slug, tags, markdown, status });
        const msg = status === 'published' ? 'Post published' : 'Draft saved';
        res.redirect(`/admin/posts/${saved.slug}/edit?message=${encodeURIComponent(msg)}`);
    } catch (err) { if (!err.status) err.status = 400; next(err); }
}

async function deletePostHandler(req, res, next) {
    try {
        await deletePost(req.params.slug);
        res.redirect('/admin/posts');
    } catch (err) { next(err); }
}

module.exports = {
    showAdminLogin, showAdminPosts, showNewPost, showEditPost,
    previewMarkdown, savePost, deletePostHandler,
};
