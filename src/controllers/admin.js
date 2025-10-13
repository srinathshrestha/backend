const { listPosts, getPostBySlug, createPost, updatePost, deletePost } = require('../utils/postStore');
const { renderMarkdown } = require('../utils/markdown');
const { uploadImage } = require('../utils/localUpload');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

function normaliseStatus(input) {
    return input === 'published' ? 'published' : 'draft';
}

function splitPosts(posts = []) {
    const published = [];
    const drafts = [];
    posts.forEach((post) => {
        if (post.status === 'published') {
            published.push(post);
        } else {
            drafts.push(post);
        }
    });
    return { published, drafts };
}

async function showAdminLogin(req, res) {
    if (res.locals.isAuthenticated) {
        return res.redirect('/admin/posts');
    }
    return res.render('admin/login', {
        title: `Login · ${res.locals.blogTitle}`,
        error: null
    });
}

async function showAdminPosts(req, res, next) {
    try {
        const posts = await listPosts({ includeDrafts: true });
        const { published, drafts } = splitPosts(posts);
        res.render('admin/posts', {
            title: `Posts · ${res.locals.blogTitle}`,
            published,
            drafts,
        });
    } catch (error) {
        next(error);
    }
}

function showNewPost(req, res) {
    res.render('admin/edit', {
        title: `New Post · ${res.locals.blogTitle}`,
        post: null,
        previewHtml: '',
        message: null,
    });
}

async function showEditPost(req, res, next) {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: true });
        if (!post) {
            return res.status(404).render('404', { title: 'Not found' });
        }
        res.render('admin/edit', {
            title: `Edit ${post.title} · ${res.locals.blogTitle}`,
            post,
            previewHtml: post.html,
            message: req.query.message || null,
        });
    } catch (error) {
        next(error);
    }
}

async function previewMarkdown(req, res, next) {
    try {
        const markdown = req.body.markdown || '';
        const html = renderMarkdown(markdown);
        res.json({ html });
    } catch (error) {
        next(error);
    }
}

async function uploadMedia(req, res, next) {
    const singleImageUpload = upload.single('image');

    singleImageUpload(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                const sizeError = new Error('Image exceeds the 5 MB upload limit');
                sizeError.status = 413;
                return next(sizeError);
            }
            err.status = err.status || (err instanceof multer.MulterError ? 400 : 500);
            return next(err);
        }

        try {
            if (!req.file) {
                const error = new Error('No image provided');
                error.status = 400;
                throw error;
            }

            const result = await uploadImage(req.file);
            res.json({
                url: result.url,
                key: result.key,
                markdown: `![${req.file.originalname || 'image'}](${result.url})`,
            });
        } catch (uploadError) {
            next(uploadError);
        }
    });
}

async function savePost(req, res, next) {
    const { originalSlug, title, slug, tags, markdown, action } = req.body;
    const targetStatus = action === 'publish' ? 'published' : normaliseStatus(req.body.status);
    const payload = {
        title,
        slug,
        tags,
        markdown,
        status: targetStatus,
    };

    try {
        const saved = originalSlug
            ? await updatePost(originalSlug, payload)
            : await createPost(payload);
        const message = targetStatus === 'published' ? 'Post published' : 'Draft saved';
        res.redirect(`/admin/posts/${saved.slug}/edit?message=${encodeURIComponent(message)}`);
    } catch (error) {
        if (!error.status) {
            error.status = 400;
        }
        next(error);
    }
}

async function deletePostHandler(req, res, next) {
    try {
        await deletePost(req.params.slug);
        res.redirect('/admin/posts');
    } catch (error) {
        next(error);
    }
}

module.exports = {
    showAdminLogin,
    showAdminPosts,
    showNewPost,
    showEditPost,
    previewMarkdown,
    uploadMedia,
    savePost,
    deletePostHandler,
};
