// ── Post helper utilities ────────────────────────────────────
// Slug generation, tag normalization, date formatting, document mapping.

const slugify = require('slugify');
const { getDb } = require('./db');

const STATUSES = { PUBLISHED: 'published', DRAFT: 'draft' };
const COLLECTION = 'posts';

/** Get the posts MongoDB collection */
function getCollection() {
    return getDb().collection(COLLECTION);
}

/** Normalize comma-separated tags into a clean lowercase array */
function normaliseTags(input) {
    if (!input) return [];
    const raw = Array.isArray(input) ? input : String(input).split(',');
    return raw.map((t) => t.trim()).filter(Boolean).map((t) => t.toLowerCase());
}

/** Generate a URL-safe slug from title or desired slug */
function computeSlug(title, desiredSlug) {
    if (desiredSlug) {
        return slugify(desiredSlug, { lower: true, strict: true })
            || slugify(title, { lower: true, strict: true });
    }
    return slugify(title, { lower: true, strict: true });
}

/** Convert a date value to ISO string, or null */
function formatDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Throw 409 if slug is already taken by another post */
async function ensureSlugAvailable(slug, excludeId) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await getCollection().findOne(query, { projection: { _id: 1 } });
    if (existing) {
        const error = new Error(`Slug "${slug}" already exists`);
        error.status = 409;
        throw error;
    }
}

/** Map a raw MongoDB document to a list-view object (no markdown/html) */
function mapListDocument(doc) {
    return {
        slug: doc.slug,
        title: doc.title,
        status: doc.status,
        tags: doc.tags || [],
        createdAt: formatDateValue(doc.createdAt),
        updatedAt: formatDateValue(doc.updatedAt),
        publishedAt: formatDateValue(doc.publishedAt),
        excerpt: doc.excerpt || '',
        heroImage: doc.heroImage || null,
    };
}

module.exports = {
    STATUSES, getCollection, normaliseTags, computeSlug,
    formatDateValue, ensureSlugAvailable, mapListDocument,
};
