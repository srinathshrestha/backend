// ── Admin controller barrel ──────────────────────────────────
// Re-exports all admin handlers from split modules.
// Routes import from here, so existing require paths still work.

const {
    showAdminLogin, showAdminPosts, showNewPost, showEditPost,
    previewMarkdown, savePost, deletePostHandler,
} = require('./adminPosts');
const { uploadMedia, listMedia, deleteMedia } = require('./adminMedia');

module.exports = {
    showAdminLogin,
    showAdminPosts,
    showNewPost,
    showEditPost,
    previewMarkdown,
    uploadMedia,
    listMedia,
    deleteMedia,
    savePost,
    deletePostHandler,
};
