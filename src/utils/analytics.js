const crypto = require('crypto');
const { getDb } = require('./db');

const COLLECTION = 'pageviews';
const BOT_RE = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegram/i;

function col() {
    return getDb().collection(COLLECTION);
}

function hashIp(ip) {
    return crypto.createHash('sha256').update(ip || '').digest('hex').slice(0, 16);
}

function cleanReferrer(ref) {
    if (!ref || ref === 'undefined') return null;
    try {
        const u = new URL(ref);
        return `${u.hostname}${u.pathname}`.slice(0, 200);
    } catch {
        return null;
    }
}

/** Record a page view. Call from showBlogPost. Silently swallows errors so a
 *  tracking failure never breaks page rendering. */
async function recordView(slug, req) {
    const ua = req.headers['user-agent'] || '';
    if (BOT_RE.test(ua)) return;

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '';
    try {
        await col().insertOne({
            slug,
            ts: new Date(),
            ipHash: hashIp(ip),
            referrer: cleanReferrer(req.headers.referer || req.headers.referrer),
        });
    } catch (_) {}
}

/** View counts for a list of slugs.
 *  Returns a Map<slug, { total, week }>  */
async function getPostViewCounts(slugs) {
    if (!slugs.length) return new Map();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await col().aggregate([
        { $match: { slug: { $in: slugs } } },
        {
            $group: {
                _id: '$slug',
                total: { $sum: 1 },
                week: { $sum: { $cond: [{ $gte: ['$ts', weekAgo] }, 1, 0] } },
            },
        },
    ]).toArray();

    const map = new Map();
    for (const r of rows) map.set(r._id, { total: r.total, week: r.week });
    return map;
}

/** Site-wide summary numbers and top referrers. */
async function getSiteSummary() {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
    const weekAgo   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const monthAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totals, topReferrers] = await Promise.all([
        col().aggregate([
            {
                $group: {
                    _id: null,
                    today: { $sum: { $cond: [{ $gte: ['$ts', startOfDay] }, 1, 0] } },
                    week:  { $sum: { $cond: [{ $gte: ['$ts', weekAgo]   }, 1, 0] } },
                    month: { $sum: { $cond: [{ $gte: ['$ts', monthAgo]  }, 1, 0] } },
                    allTime: { $sum: 1 },
                },
            },
        ]).toArray(),

        col().aggregate([
            { $match: { referrer: { $ne: null }, ts: { $gte: monthAgo } } },
            { $group: { _id: '$referrer', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]).toArray(),
    ]);

    const t = totals[0] || { today: 0, week: 0, month: 0, allTime: 0 };
    return {
        today: t.today,
        week: t.week,
        month: t.month,
        allTime: t.allTime,
        topReferrers: topReferrers.map(r => ({ source: r._id, count: r.count })),
    };
}

module.exports = { recordView, getPostViewCounts, getSiteSummary };
