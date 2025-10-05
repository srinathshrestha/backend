const { validateSession } = require('../utils/sessionStore');
const { readTokenFromRequest } = require('../utils/auth');

function authRequired(req, res, next) {
    const token = readTokenFromRequest(req);
    if (!validateSession(token)) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    req.sessionToken = token;
    return next();
}

module.exports = authRequired;
