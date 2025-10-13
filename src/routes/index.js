const express = require('express');
const router = express.Router();

// Import controllers
const { showLanding, showBlogs, showPortfolio, showDownloadResume, showBlogPost, showRssFeed } = require('../controllers/public');
const { showAdminLogin, showAdminPosts, showNewPost, showEditPost, previewMarkdown, uploadMedia, savePost, deletePostHandler } = require('../controllers/admin');
const { handleLogin, handleLogout, requireAuth } = require('../controllers/auth');

// Public routes
router.get('/', showLanding);
router.get('/blogs', showBlogs);
router.get('/portfolio', showPortfolio);
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

router.post('/admin/preview', requireAuth, previewMarkdown);
router.post('/admin/media/upload', requireAuth, uploadMedia);
router.post('/admin/posts/save', requireAuth, savePost);
router.post('/admin/posts/:slug/delete', requireAuth, deletePostHandler);

module.exports = router;
