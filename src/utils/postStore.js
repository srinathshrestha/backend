const slugify = require('slugify');

const { getDb } = require('./db');
const { buildExcerpt } = require('./excerpt');
const { renderMarkdown } = require('./markdown');

const STATUSES = {
    PUBLISHED: 'published',
    DRAFT: 'draft',
};

const COLLECTION = 'posts';

function normaliseTags(input) {
    if (!input) return [];
    const raw = Array.isArray(input) ? input : String(input).split(',');
    return raw
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.toLowerCase());
}

function computeSlug(title, desiredSlug) {
    if (desiredSlug) {
        return slugify(desiredSlug, { lower: true, strict: true }) || slugify(title, { lower: true, strict: true });
    }
    return slugify(title, { lower: true, strict: true });
}

function getCollection() {
    return getDb().collection(COLLECTION);
}

function formatDateValue(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function ensureSlugAvailable(slug, excludeId) {
    const collection = getCollection();
    const query = { slug };
    if (excludeId) {
        query._id = { $ne: excludeId };
    }
    const existing = await collection.findOne(query, { projection: { _id: 1 } });
    if (existing) {
        const error = new Error(`Slug "${slug}" already exists`);
        error.status = 409;
        throw error;
    }
}

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

async function listPosts({ includeDrafts = false, search, tag } = {}) {
    const collection = getCollection();
    const query = {};
    if (!includeDrafts) {
        query.status = STATUSES.PUBLISHED;
    }
    if (tag) {
        query.tags = tag.toLowerCase();
    }

    const cursor = collection.find(query, {
        projection: {
            markdown: 0,
        },
        sort: {
            publishedAt: -1,
            updatedAt: -1,
        },
    });

    const docs = await cursor.toArray();
    let posts = docs.map(mapListDocument);

    if (search) {
        const lowered = search.toLowerCase();
        posts = posts.filter((post) =>
            post.title.toLowerCase().includes(lowered)
            || (post.excerpt || '').toLowerCase().includes(lowered),
        );
    }

    return posts;
}

async function getPostBySlug(slug, { includeDrafts = false } = {}) {
    const collection = getCollection();
    const normalizedSlug = slug.trim().toLowerCase();
    const query = { slug: normalizedSlug };
    if (!includeDrafts) {
        query.status = STATUSES.PUBLISHED;
    }

    const doc = await collection.findOne(query);
    if (!doc) {
        return null;
    }

    return {
        slug: doc.slug,
        title: doc.title,
        status: doc.status,
        tags: doc.tags || [],
        createdAt: formatDateValue(doc.createdAt),
        updatedAt: formatDateValue(doc.updatedAt),
        publishedAt: formatDateValue(doc.publishedAt),
        excerpt: doc.excerpt || '',
        markdown: doc.markdown || '',
        html: renderMarkdown(doc.markdown || ''),
        heroImage: doc.heroImage || null,
        attachments: doc.attachments || [],
    };
}

async function createPost({ title, markdown, tags, status = STATUSES.DRAFT, slug: desiredSlug, heroImage = null, attachments = [] }) {
    const collection = getCollection();
    const slug = computeSlug(title, desiredSlug);
    await ensureSlugAvailable(slug);

    const normalizedStatus = status === STATUSES.PUBLISHED ? STATUSES.PUBLISHED : STATUSES.DRAFT;
    const tagsArray = normaliseTags(tags);
    const now = new Date();
    const publishedAt = normalizedStatus === STATUSES.PUBLISHED ? now : null;
    const excerpt = buildExcerpt(markdown);

    await collection.insertOne({
        slug,
        title,
        markdown: markdown || '',
        tags: tagsArray,
        status: normalizedStatus,
        createdAt: now,
        updatedAt: now,
        publishedAt,
        excerpt,
        heroImage: heroImage || null,
        attachments: attachments || [],
    });

    return getPostBySlug(slug, { includeDrafts: true });
}

async function updatePost(originalSlug, { title, markdown, tags, status, slug: desiredSlug, heroImage, attachments }) {
    const collection = getCollection();
    const existing = await collection.findOne({ slug: originalSlug });
    if (!existing) {
        const error = new Error(`Post with slug "${originalSlug}" not found`);
        error.status = 404;
        throw error;
    }

    const nextStatus = status === STATUSES.PUBLISHED ? STATUSES.PUBLISHED : status === STATUSES.DRAFT ? STATUSES.DRAFT : existing.status;
    const tagsArray = typeof tags !== 'undefined' ? normaliseTags(tags) : existing.tags || [];
    const newTitle = title || existing.title;
    const slug = computeSlug(newTitle, desiredSlug || existing.slug);
    const markdownContent = typeof markdown === 'string' ? markdown : existing.markdown || '';
    const now = new Date();
    const publishedAt = nextStatus === STATUSES.PUBLISHED
        ? existing.publishedAt || now
        : null;
    const excerpt = buildExcerpt(markdownContent);

    if (slug !== existing.slug) {
        await ensureSlugAvailable(slug, existing._id);
    }

    await collection.updateOne(
        { _id: existing._id },
        {
            $set: {
                slug,
                title: newTitle,
                markdown: markdownContent,
                tags: tagsArray,
                status: nextStatus,
                updatedAt: now,
                publishedAt,
                excerpt,
                heroImage: typeof heroImage !== 'undefined' ? heroImage : (existing.heroImage || null),
                attachments: typeof attachments !== 'undefined' ? attachments : (existing.attachments || []),
            },
        },
    );

    return getPostBySlug(slug, { includeDrafts: true });
}

async function deletePost(slug) {
    const collection = getCollection();
    const result = await collection.deleteOne({ slug });
    if (result.deletedCount === 0) {
        const error = new Error(`Post with slug "${slug}" not found`);
        error.status = 404;
        throw error;
    }
    return true;
}

async function collectTags() {
    const collection = getCollection();
    const pipeline = [
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
    ];

    const tags = await collection.aggregate(pipeline).toArray();
    return tags.map((entry) => ({ tag: entry._id, count: entry.count }));
}

module.exports = {
    STATUSES,
    listPosts,
    getPostBySlug,
    createPost,
    updatePost,
    deletePost,
    collectTags,
};
