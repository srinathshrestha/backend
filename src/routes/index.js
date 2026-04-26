const express = require('express');
const router = express.Router();

// Import controllers
const { showBlogs, showPortfolio, showDownloadResume, showBlogPost, showRssFeed } = require('../controllers/public');
const { showAdminLogin, showAdminPosts, showNewPost, showEditPost, previewMarkdown, uploadMedia, listMedia, deleteMedia, savePost, deletePostHandler } = require('../controllers/admin');
const { handleLogin, handleLogout, requireAuth } = require('../controllers/auth');

// Public routes
router.get('/', showPortfolio);
router.get('/blogs', showBlogs);
router.get('/portfolio', (req, res) => res.redirect(301, '/'));
router.get('/resume', showDownloadResume);
router.get('/blogs/:slug', showBlogPost);
router.get('/rss.xml', showRssFeed);

// Admin routes
router.get('/admin', showAdminLogin);
router.post('/admin/login', handleLogin);
router.post('/admin/logout', handleLogout);

router.get('/admin/posts', requireAuth, showAdminPosts);
router.get('/admin/posts/new', requireAuth, showNewPost);
router.get('/admin/posts/:slug/edit', requireAuth, showEditPost);

router.get('/admin/media', requireAuth, listMedia);
router.post('/admin/media/upload', requireAuth, uploadMedia);
router.delete('/admin/media', requireAuth, deleteMedia);
router.post('/admin/preview', requireAuth, previewMarkdown);
router.post('/admin/posts/save', requireAuth, savePost);
router.post('/admin/posts/:slug/delete', requireAuth, deletePostHandler);

module.exports = router;