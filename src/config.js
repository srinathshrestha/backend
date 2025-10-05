const path = require('path');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath, override: false });

function toInt(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

const rawConfig = {
    port: toInt(process.env.PORT, 3000),
    siteUrl: process.env.SITE_URL || 'http://localhost:3000',
    blogTitle: process.env.BLOG_TITLE || 'Rawdog Dev Log',
    sessionTtlDays: toInt(process.env.SESSION_TTL_DAYS, 7),
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
    adminPassword: process.env.ADMIN_PASSWORD,
    mongodbUri: process.env.MONGODB_URI,
    mongodbDbName: process.env.MONGODB_DB_NAME || 'myblogs',
};

let resolvedHash = rawConfig.adminPasswordHash;
if (!resolvedHash && rawConfig.adminPassword) {
    resolvedHash = bcrypt.hashSync(rawConfig.adminPassword, 12);
    if (process.env.NODE_ENV !== 'test') {
        console.warn('[rawdog-blog] ADMIN_PASSWORD provided. Hashing it for this session.');
    }
}

if (!resolvedHash) {
    throw new Error('ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD for local dev) must be set');
}

if (!rawConfig.mongodbUri) {
    throw new Error('MONGODB_URI must be set');
}

module.exports = {
    port: rawConfig.port,
    siteUrl: rawConfig.siteUrl,
    blogTitle: rawConfig.blogTitle,
    sessionTtlDays: rawConfig.sessionTtlDays,
    adminPasswordHash: resolvedHash,
    mongodbUri: rawConfig.mongodbUri,
    mongodbDbName: rawConfig.mongodbDbName,
};
