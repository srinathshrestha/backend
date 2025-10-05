const app = require('./app');
const { port } = require('./config');
const { connectToDatabase, closeDatabase } = require('./utils/db');

async function start() {
    try {
        await connectToDatabase();
        const server = app.listen(port, () => {
            console.log(`[rawdog-blog] listening on http://localhost:${port}`);
        });

        const shutdown = () => {
            server.close(async (closeError) => {
                if (closeError) {
                    console.error('[rawdog-blog] error during shutdown', closeError);
                }
                await closeDatabase();
                process.exit(0);
            });
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        console.error('[rawdog-blog] failed to start server', error);
        process.exit(1);
    }
}

start();
