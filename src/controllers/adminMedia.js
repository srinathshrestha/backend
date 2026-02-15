// ── Admin media upload handler ───────────────────────────────
// Handles image uploads via multer + local disk storage.

const multer = require('multer');
const { uploadImage } = require('../utils/localUpload');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

async function uploadMedia(req, res, next) {
    const singleUpload = upload.single('image');

    singleUpload(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                const e = new Error('Image exceeds the 5 MB upload limit');
                e.status = 413;
                return next(e);
            }
            err.status = err.status || (err instanceof multer.MulterError ? 400 : 500);
            return next(err);
        }

        try {
            if (!req.file) {
                const e = new Error('No image provided');
                e.status = 400;
                throw e;
            }
            const result = await uploadImage(req.file);
            res.json({
                url: result.url,
                key: result.key,
                markdown: `![${req.file.originalname || 'image'}](${result.url})`,
            });
        } catch (uploadErr) { next(uploadErr); }
    });
}

module.exports = { uploadMedia };
