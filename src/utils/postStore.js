// ── Post store: queries and mutations ─────────────────────────
// All database operations for blog posts.

const { buildExcerpt } = require('./excerpt');
const { renderMarkdown } = require('./markdown');
const {
    STATUSES, getCollection, normaliseTags, computeSlug,
    formatDateValue, ensureSlugAvailable, mapListDocument,
} = require('./postHelpers');

async function listPosts({ includeDrafts = false, search, tag } = {}) {
    const query = {};
    if (!includeDrafts) query.status = STATUSES.PUBLISHED;
    if (tag) query.tags = tag.toLowerCase();

    const docs = await getCollection()
        .find(query, { projection: { markdown: 0 }, sort: { publishedAt: -1, updatedAt: -1 } })
        .toArray();

    let posts = docs.map(mapListDocument);
    if (search) {
        const low = search.toLowerCase();
        posts = posts.filter((p) =>
            p.title.toLowerCase().includes(low) || (p.excerpt || '').toLowerCase().includes(low));
    }
    return posts;
}

async function getPostBySlug(slug, { includeDrafts = false } = {}) {
    const query = { slug: slug.trim().toLowerCase() };
    if (!includeDrafts) query.status = STATUSES.PUBLISHED;
    const doc = await getCollection().findOne(query);
    if (!doc) return null;
    return {
        slug: doc.slug, title: doc.title, status: doc.status,
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

async function createPost({ title, markdown, tags, status = STATUSES.DRAFT, slug: desiredSlug }) {
    const slug = computeSlug(title, desiredSlug);
    await ensureSlugAvailable(slug);
    const normalizedStatus = status === STATUSES.PUBLISHED ? STATUSES.PUBLISHED : STATUSES.DRAFT;
    const now = new Date();
    await getCollection().insertOne({
        slug, title, markdown: markdown || '',
        tags: normaliseTags(tags), status: normalizedStatus,
        createdAt: now, updatedAt: now,
        publishedAt: normalizedStatus === STATUSES.PUBLISHED ? now : null,
        excerpt: buildExcerpt(markdown),
        heroImage: null, attachments: [],
    });
    return getPostBySlug(slug, { includeDrafts: true });
}

async function updatePost(originalSlug, { title, markdown, tags, status, slug: desiredSlug }) {
    const col = getCollection();
    const existing = await col.findOne({ slug: originalSlug });
    if (!existing) { const e = new Error(`Post "${originalSlug}" not found`); e.status = 404; throw e; }

    const nextStatus = status === STATUSES.PUBLISHED ? STATUSES.PUBLISHED
        : status === STATUSES.DRAFT ? STATUSES.DRAFT : existing.status;
    const newTitle = title || existing.title;
    const slug = computeSlug(newTitle, desiredSlug || existing.slug);
    const md = typeof markdown === 'string' ? markdown : existing.markdown || '';
    const now = new Date();
    if (slug !== existing.slug) await ensureSlugAvailable(slug, existing._id);

    await col.updateOne({ _id: existing._id }, { $set: {
        slug, title: newTitle, markdown: md,
        tags: typeof tags !== 'undefined' ? normaliseTags(tags) : existing.tags || [],
        status: nextStatus, updatedAt: now,
        publishedAt: nextStatus === STATUSES.PUBLISHED ? (existing.publishedAt || now) : null,
        excerpt: buildExcerpt(md),
    }});
    return getPostBySlug(slug, { includeDrafts: true });
}

async function deletePost(slug) {
    const result = await getCollection().deleteOne({ slug });
    if (result.deletedCount === 0) {
        const e = new Error(`Post "${slug}" not found`); e.status = 404; throw e;
    }
}

async function collectTags() {
    const pipeline = [
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
    ];
    return (await getCollection().aggregate(pipeline).toArray())
        .map((e) => ({ tag: e._id, count: e.count }));
}

module.exports = { STATUSES, listPosts, getPostBySlug, createPost, updatePost, deletePost, collectTags };
