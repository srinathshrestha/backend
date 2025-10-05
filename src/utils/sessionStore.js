const crypto = require('crypto');
const { sessionTtlDays } = require('../config');

const ttlMs = sessionTtlDays * 24 * 60 * 60 * 1000;
const sessions = new Map(); // token -> expiresAt (ms)

function createSession() {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + ttlMs;
    sessions.set(token, expiresAt);
    return { token, expiresAt };
}

function validateSession(token) {
    if (!token) return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        sessions.delete(token);
        return false;
    }
    return true;
}

function revokeSession(token) {
    if (!token) return;
    sessions.delete(token);
}

function purgeExpired() {
    const now = Date.now();
    for (const [token, expiresAt] of sessions.entries()) {
        if (expiresAt <= now) {
            sessions.delete(token);
        }
    }
}

function resetSessions() {
    sessions.clear();
}

module.exports = {
    createSession,
    validateSession,
    revokeSession,
    purgeExpired,
    resetSessions,
};
