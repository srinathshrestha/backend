#!/usr/bin/env node
// One-shot script: uploads all local public/uploads/* files to S3 and prints the URL mapping.
// Run: node scripts/migrate-uploads-to-s3.js
// Requires .env with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION;
const UPLOADS_DIR = path.join(__dirname, '../public/uploads');

if (!BUCKET || !REGION) {
    console.error('Missing S3_BUCKET or AWS_REGION in .env');
    process.exit(1);
}

const s3 = new S3Client({ region: REGION });

function walk(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results = results.concat(walk(full));
        else results.push(full);
    }
    return results;
}

async function main() {
    const files = walk(UPLOADS_DIR);
    console.log(`\nFound ${files.length} file(s) to migrate.\n`);
    console.log('OLD URL  →  NEW URL\n' + '─'.repeat(80));

    for (const filePath of files) {
        const key = path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');
        const contentType = mime.lookup(filePath) || 'application/octet-stream';
        const body = fs.readFileSync(filePath);

        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
        }));

        const oldUrl = `/uploads/${key}`;
        const newUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
        console.log(`${oldUrl}\n  → ${newUrl}\n`);
    }

    console.log('─'.repeat(80));
    console.log('Migration complete. Update the above URLs in your blog posts.');
}

main().catch((err) => { console.error(err); process.exit(1); });
