const express = require('express');
const bcrypt = require('bcrypt');

const { adminPasswordHash, sessionTtlDays } = require('../config');
const { createSession, revokeSession, validateSession } = require('../utils/sessionStore');
const { COOKIE_NAME, readTokenFromRequest } = require('../utils/auth');

const router = express.Router();
const cookieMaxAge = sessionTtlDays * 24 * 60 * 60 * 1000;

router.post('/login', async (req, res, next) => {
    try {
        const { password } = req.body || {};
        if (!password) {
            return res.status(400).json({ error: 'password required' });
        }
        const isValid = await bcrypt.compare(password, adminPasswordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'invalid credentials' });
        }
        const session = createSession();
        res.cookie(COOKIE_NAME, session.token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: cookieMaxAge,
            secure: process.env.NODE_ENV === 'production',
        });
        return res.json({ ok: true, expiresAt: session.expiresAt });
    } catch (error) {
        return next(error);
    }
});

router.post('/logout', (req, res) => {
    const token = readTokenFromRequest(req);
    if (token) {
        revokeSession(token);
        res.clearCookie(COOKIE_NAME);
    }
    res.json({ ok: true });
});

router.get('/session', (req, res) => {
    const token = readTokenFromRequest(req);
    const valid = validateSession(token);
    if (!valid) {
        res.clearCookie(COOKIE_NAME);
    }
    res.json({ authenticated: valid });
});

module.exports = router;
