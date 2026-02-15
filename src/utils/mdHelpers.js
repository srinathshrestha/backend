// ── Shared markdown helpers ──────────────────────────────────

/** Escape special HTML characters to prevent XSS */
function escapeHtml(value = '') {
    return value
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only allow safe image sources: data URIs, http(s), or /uploads/ */
function sanitizeImageSrc(src = '') {
    if (typeof src !== 'string') return '';
    const t = src.trim();
    if (!t) return '';
    if (/^data:image\//i.test(t)) return t;
    if (/^https?:\/\//i.test(t)) return t;
    if (/^\/uploads\//i.test(t)) return t;
    return '';
}

module.exports = { escapeHtml, sanitizeImageSrc };
