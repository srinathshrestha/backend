const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const multer = require('multer');

const { purgeExpired, validateSession, createSession, revokeSession } = require('./utils/sessionStore');
const { readTokenFromRequest, COOKIE_NAME } = require('./utils/auth');
const { listPosts, getPostBySlug, createPost, updatePost, deletePost } = require('./utils/postStore');
const { buildRssFeed } = require('./utils/rss');
const { renderMarkdown } = require('./utils/markdown');
const { blogTitle, siteUrl, adminPasswordHash, sessionTtlDays } = require('./config');
const { VIEWS_DIR, PUBLIC_DIR } = require('./utils/paths');
const { uploadImage } = require('./utils/localUpload');
const errorHandler = require('./middleware/errorHandler');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
});

function formatDate(value) {
    if (!value) {
        return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return dateFormatter.format(date);
}

const app = express();

app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

app.use((req, res, next) => {
    purgeExpired();
    res.locals.blogTitle = blogTitle;
    res.locals.year = new Date().getFullYear();
    res.locals.isAuthenticated = isAuthenticated(req);
    res.locals.formatDate = formatDate;
    next();
});

// Lightweight health check for deployment platforms/load balancers
app.get('/health', (req, res) => {
    res.type('application/json').send({ ok: true });
});

function isAuthenticated(req) {
    const token = readTokenFromRequest(req);
    return validateSession(token);
}

function requireAuth(req, res, next) {
    if (!res.locals.isAuthenticated) {
        // For API endpoints, return JSON error instead of redirect
        if (req.path.startsWith('/admin/media/') || req.path.startsWith('/admin/preview')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/admin');
    }
    return next();
}

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

app.get('/', async (req, res, next) => {
    try {
        const posts = await listPosts();
        res.render('index', { title: blogTitle, posts });
    } catch (error) {
        next(error);
    }
});

app.get('/blog/:slug', async (req, res, next) => {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: false });
        if (!post || post.status !== 'published') {
            return res.status(404).render('404', { title: 'Not found' });
        }
        res.render('post', { title: post.title, post });
    } catch (error) {
        next(error);
    }
});

app.get('/rss.xml', async (req, res, next) => {
    try {
        const posts = await listPosts();
        const detailed = await Promise.all(posts.filter((post) => post.status === 'published').map((post) => getPostBySlug(post.slug)));
        const xml = buildRssFeed({ siteUrl, blogTitle, posts: detailed.filter(Boolean) });
        res.type('application/rss+xml').send(xml);
    } catch (error) {
        next(error);
    }
});

app.get('/admin', (req, res) => {
    if (res.locals.isAuthenticated) {
        return res.redirect('/admin/posts');
    }
    return res.render('admin/login', { title: `Login · ${blogTitle}`, error: null });
});

app.post('/admin/login', async (req, res, next) => {
    try {
        const password = req.body.password || '';
        const ok = await bcrypt.compare(password, adminPasswordHash);
        if (!ok) {
            return res.status(401).render('admin/login', { title: `Login · ${blogTitle}`, error: 'Invalid password' });
        }
        const session = createSession();
        res.cookie(COOKIE_NAME, session.token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: sessionTtlDays * 24 * 60 * 60 * 1000,
            secure: process.env.NODE_ENV === 'production',
        });
        return res.redirect('/admin/posts');
    } catch (error) {
        next(error);
    }
});

app.post('/admin/logout', (req, res) => {
    const token = readTokenFromRequest(req);
    if (token) {
        revokeSession(token);
        res.clearCookie(COOKIE_NAME);
    }
    res.redirect('/admin');
});

app.get('/admin/posts', requireAuth, async (req, res, next) => {
    try {
        const posts = await listPosts({ includeDrafts: true });
        const { published, drafts } = splitPosts(posts);
        res.render('admin/posts', {
            title: `Posts · ${blogTitle}`,
            published,
            drafts,
        });
    } catch (error) {
        next(error);
    }
});

app.get('/admin/posts/new', requireAuth, (req, res) => {
    res.render('admin/edit', {
        title: `New Post · ${blogTitle}`,
        post: null,
        previewHtml: '',
        message: null,
    });
});

app.get('/admin/posts/:slug/edit', requireAuth, async (req, res, next) => {
    try {
        const post = await getPostBySlug(req.params.slug, { includeDrafts: true });
        if (!post) {
            return res.status(404).render('404', { title: 'Not found' });
        }
        res.render('admin/edit', {
            title: `Edit ${post.title} · ${blogTitle}`,
            post,
            previewHtml: post.html,
            message: req.query.message || null,
        });
    } catch (error) {
        next(error);
    }
});

app.post('/admin/preview', requireAuth, (req, res, next) => {
    try {
        const markdown = req.body.markdown || '';
        const html = renderMarkdown(markdown);
        res.json({ html });
    } catch (error) {
        next(error);
    }
});

const singleImageUpload = upload.single('image');

app.post('/admin/media/upload', requireAuth, (req, res, next) => {
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
});

app.post('/admin/posts/save', requireAuth, async (req, res, next) => {
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
});

app.post('/admin/posts/:slug/delete', requireAuth, async (req, res, next) => {
    try {
        await deletePost(req.params.slug);
        res.redirect('/admin/posts');
    } catch (error) {
        next(error);
    }
});

app.use((req, res) => {
    res.status(404).render('404', { title: 'Not found' });
});

app.use(errorHandler);

module.exports = app;
