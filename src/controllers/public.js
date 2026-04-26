const path = require('path');
const { listPosts, getPostBySlug } = require('../utils/postStore');
const { buildRssFeed } = require('../utils/rss');
const { siteUrl, blogTitle } = require('../config');
const { PUBLIC_DIR } = require('../utils/paths');
const { recordView } = require('../utils/analytics');

async function showBlogs(req, res, next) {
    try {
        const posts = await listPosts();
        res.render('index', { title: blogTitle, posts });
    } catch (error) {
        next(error);
    }
}

function showPortfolio(req, res) {
    res.render('portfolio', { title: 'Portfolio · Srinath' });
}

async function showBlogPost(req, res, next) {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: false });
        if (!post || post.status !== 'published') {
            return res.status(404).render('404', { title: 'Not found' });
        }
        recordView(post.slug, req);
        const allPosts = await listPosts();
        const idx = allPosts.findIndex(p => p.slug === post.slug);
        const prevPost = idx < allPosts.length - 1 ? allPosts[idx + 1] : null;
        const nextPost = idx > 0 ? allPosts[idx - 1] : null;
        res.render('post', { title: post.title, post, prevPost, nextPost });
    } catch (error) {
        next(error);
    }
}

function showLanding(req, res) {
    res.render('landing', { title: res.locals.blogTitle });
}

async function showDownloadResume(req, res, next) {
    try {
        const resumePath = path.join(PUBLIC_DIR, 'resume', 'srinathShresthaResume.pdf');
        return res.download(resumePath, 'SrinathShresthaResume.pdf');
    } catch (error) {
        console.error(error);
        return res.status(500).send('Error downloading resume');
    }
}

async function showRssFeed(req, res, next) {
    try {
        const posts = await listPosts();
        const detailed = await Promise.all(
            posts.filter((post) => post.status === 'published')
                .map((post) => getPostBySlug(post.slug))
        );
        const xml = buildRssFeed({
            siteUrl,
            blogTitle,
            posts: detailed.filter(Boolean),
        });
        res.type('application/rss+xml').send(xml);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    showLanding,
    showBlogs,
    showPortfolio,
    showDownloadResume,
    showBlogPost,
    showRssFeed,
};
