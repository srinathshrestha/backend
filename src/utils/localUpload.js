const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

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
    if (currentExt) {
        return filename;
    }
    const inferred = EXTENSION_BY_TYPE[mimeType];
    if (!inferred) {
        return filename;
    }
    return `${filename}${inferred}`;
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
    const fileName = buildFileName(safeName);
    const uploadPath = path.join(__dirname, '../../public/uploads', fileName);
    const uploadDir = path.dirname(uploadPath);

    // Ensure upload directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    // Write file to disk
    await fs.writeFile(uploadPath, buffer);

    // Return public URL
    const url = `/uploads/${fileName}`;
    console.log('Uploaded image URL:', url);
    return { key: fileName, url };
}

async function deleteImage(fileName) {
    if (!fileName) {
        return;
    }
    const filePath = path.join(__dirname, '../../public/uploads', fileName);
    try {
        await fs.unlink(filePath);
    } catch (error) {
        console.error('Error deleting file:', error);
    }
}

module.exports = {
    uploadImage,
    deleteImage,
};
