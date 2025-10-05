const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const POSTS_DIR = path.join(CONTENT_DIR, 'posts');
const DRAFTS_DIR = path.join(CONTENT_DIR, 'drafts');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

module.exports = {
    ROOT_DIR,
    CONTENT_DIR,
    POSTS_DIR,
    DRAFTS_DIR,
    VIEWS_DIR,
    PUBLIC_DIR,
};
