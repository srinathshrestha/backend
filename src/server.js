'use strict';

const { app, port, siteUrl, closeDatabase } = require('./app');

const server = app.listen(port, () => {
    const base = (siteUrl || '').replace(/\/$/, '') || `http://localhost:${port}`;
    console.log(`[rawdog-blog] listening on ${base}`);
});

function shutdown() {
    server.close(async (err) => {
        if (err) console.error('[rawdog-blog] error during shutdown', err);
        await closeDatabase();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
