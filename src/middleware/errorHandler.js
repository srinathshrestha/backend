// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    if (status >= 500) {
        console.error(err); // keep the raw vibe but still log
    }
    const message = err.message || 'internal server error';
    if (req.accepts('html')) {
        const template = status >= 500 ? '500' : status === 404 ? '404' : 'error';
        const title = status >= 500 ? 'Server error' : status === 404 ? 'Not found' : 'Error';
        return res.status(status).render(template, { title, message, status });
    }
    if (req.accepts('json')) {
        return res.status(status).json({ error: message });
    }
    return res.status(status).type('text/plain').send(message);
}

module.exports = errorHandler;
