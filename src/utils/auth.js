const COOKIE_NAME = 'rawdog_session';

function readTokenFromRequest(req) {
    return req.cookies ? req.cookies[COOKIE_NAME] : undefined;
}

module.exports = {
    COOKIE_NAME,
    readTokenFromRequest,
};
