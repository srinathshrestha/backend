const fs = require('fs/promises');
const path = require('path');
const matter = require('gray-matter');
const slugify = require('slugify');

const { POSTS_DIR, DRAFTS_DIR } = require('./paths');
const { buildExcerpt } = require('./excerpt');

const STATUSES = {
    PUBLISHED: 'published',
    DRAFT: 'draft',
};

function normaliseTags(input) {
    if (!input) return [];
    const raw = Array.isArray(input) ? input : String(input).split(',');
    return raw
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.toLowerCase());
}

function valueToDate(input, fallback) {
    if (!input) {
        return fallback;
    }
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }
    return date;
}

async function readDirectory(dirPath, status) {
    try {
        const entries = await fs.readdir(dirPath);
        const files = entries.filter((name) => name.endsWith('.md'));
        const results = [];
        for (const fileName of files) {
            const filePath = path.join(dirPath, fileName);
            const raw = await fs.readFile(filePath, 'utf8');
            const parsed = matter(raw);
            const frontMatter = parsed.data || {};
            const baseSlug = frontMatter.slug || path.basename(fileName, path.extname(fileName));
            const slug = slugify(baseSlug, { lower: true, strict: true });
            const markdown = parsed.content.trim();
            const createdAt = valueToDate(frontMatter.createdAt, new Date());
            const updatedAt = valueToDate(frontMatter.updatedAt, createdAt);
            const publishedAt = status === STATUSES.PUBLISHED
                ? valueToDate(frontMatter.publishedAt, createdAt)
                : null;

            results.push({
                slug,
                title: frontMatter.title || baseSlug,
                markdown,
                tags: normaliseTags(frontMatter.tags),
                status,
                createdAt,
                updatedAt,
                publishedAt,
                excerpt: frontMatter.excerpt || buildExcerpt(markdown),
                heroImage: frontMatter.heroImage || null,
                attachments: frontMatter.attachments || [],
            });
        }
        return results;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function importFromFilesystem(db) {
    const collection = db.collection('posts');
    const currentCount = await collection.estimatedDocumentCount();
    if (currentCount > 0) {
        return;
    }

    const [published, drafts] = await Promise.all([
        readDirectory(POSTS_DIR, STATUSES.PUBLISHED),
        readDirectory(DRAFTS_DIR, STATUSES.DRAFT),
    ]);

    const documents = [...published, ...drafts];
    if (!documents.length) {
        return;
    }

    await collection.insertMany(documents);
    console.log(`[rawdog-blog] imported ${documents.length} markdown ${documents.length === 1 ? 'post' : 'posts'} from filesystem`);
}

module.exports = {
    importFromFilesystem,
};
