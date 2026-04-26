const crypto = require('crypto');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
]);

const EXTENSION_BY_TYPE = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
};

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;

function buildFileName(filename) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '');
    return `${year}/${month}/${uuid}-${safeBaseName}${ext.toLowerCase()}`;
}

function ensureExtension(mimeType, filename) {
    const currentExt = path.extname(filename);
    if (currentExt) return filename;
    const inferred = EXTENSION_BY_TYPE[mimeType];
    return inferred ? `${filename}${inferred}` : filename;
}

function publicUrl(key) {
    return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

async function uploadImage({ buffer, mimetype, originalname }) {
    if (!buffer || !buffer.length) {
        const error = new Error('Empty file');
        error.status = 400;
        throw error;
    }

    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
        const error = new Error(`Unsupported image type: ${mimetype}`);
        error.status = 415;
        throw error;
    }

    const safeName = ensureExtension(mimetype, originalname || 'upload');
    const key = buildFileName(safeName);

    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
    }));

    const url = publicUrl(key);
    return { key, url };
}

async function deleteImage(key) {
    if (!key) return;
    try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (error) {
        console.error('Error deleting S3 object:', error);
    }
}

async function listImages() {
    const results = [];
    let token;
    do {
        const res = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            ContinuationToken: token,
        }));
        for (const obj of res.Contents || []) {
            results.push({
                key: obj.Key,
                url: publicUrl(obj.Key),
                size: obj.Size,
                lastModified: obj.LastModified,
            });
        }
        token = res.NextContinuationToken;
    } while (token);
    results.sort((a, b) => b.lastModified - a.lastModified);
    return results;
}

module.exports = { uploadImage, deleteImage, listImages };
