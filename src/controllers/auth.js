const bcrypt = require('bcrypt');
const { createSession, revokeSession } = require('../utils/sessionStore');
const { readTokenFromRequest, COOKIE_NAME } = require('../utils/auth');
const { adminPasswordHash, sessionTtlDays } = require('../config');

function isAuthenticated(req) {
    const token = readTokenFromRequest(req);
    const { validateSession } = require('../utils/sessionStore');
    return validateSession(token);
}

function requireAuth(req, res, next) {
    if (!isAuthenticated(req)) {
        // For API endpoints, return JSON error instead of redirect
        if (req.path.startsWith('/admin/media/') || req.path.startsWith('/admin/preview')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/admin');
    }
    return next();
}

async function handleLogin(req, res, next) {
    try {
        const password = req.body.password || '';
        const ok = await bcrypt.compare(password, adminPasswordHash);
        if (!ok) {
            return res.status(401).render('admin/login', {
                title: `Login · ${res.locals.blogTitle}`,
                error: 'Invalid password'
            });
        }
        const session = createSession();
        res.cookie(COOKIE_NAME, session.token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: sessionTtlDays * 24 * 60 * 60 * 1000,
            secure: process.env.NODE_ENV === 'production',
        });
        return res.redirect('/admin/posts');
    } catch (error) {
        next(error);
    }
}

function handleLogout(req, res) {
    const token = readTokenFromRequest(req);
    if (token) {
        revokeSession(token);
        res.clearCookie(COOKIE_NAME);
    }
    res.redirect('/admin');
}

module.exports = {
    isAuthenticated,
    requireAuth,
    handleLogin,
    handleLogout,
};
