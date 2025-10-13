const express = require('express');
const cookieParser = require('cookie-parser');

const { purgeExpired } = require('./utils/sessionStore');
const { blogTitle } = require('./config');
const { VIEWS_DIR, PUBLIC_DIR } = require('./utils/paths');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const routes = require('./routes');

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

// Global middleware
app.use((req, res, next) => {
    purgeExpired();
    res.locals.blogTitle = blogTitle;
    res.locals.year = new Date().getFullYear();
    res.locals.formatDate = formatDate;
    next();
});

// Lightweight health check for deployment platforms/load balancers
app.get('/health', (req, res) => {
    res.type('application/json').send({ ok: true });
});

// Use all routes
app.use('/', routes);

// 404 handler - must come after routes
app.use((req, res) => {
    res.status(404).render('404', { title: 'Not found' });
});

// Error handler - must come last
app.use(errorHandler);

module.exports = app;
