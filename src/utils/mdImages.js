// ── Image renderer with sizing/alignment/caption support ─────
//
// Custom syntax in the alt text:
//   ![alt|width|align](/path)
//
// Examples:
//   ![diagram|600](/uploads/2026/pic.png)       → 600px wide, centered
//   ![photo|400|left](/uploads/2026/pic.png)    → 400px, floated left
//   ![chart|500|right](/uploads/2026/pic.png)   → 500px, floated right
//   ![normal image](/uploads/2026/pic.png)      → default (full-width, centered)

const { escapeHtml, sanitizeImageSrc } = require('./mdHelpers');

/** Build image renderer and attach it to the given renderer object */
function attachImageRenderer(renderer) {
    renderer.image = function imageRenderer(src, title, text) {
        let actualSrc = '';
        if (typeof src === 'string') actualSrc = src;
        else if (src && src.href) actualSrc = src.href;
        else actualSrc = String(src || '');

        const safeSrc = sanitizeImageSrc(actualSrc);
        if (!safeSrc) return text ? escapeHtml(String(text || '')) : '';

        // Parse: alt|width|align
        const parts = String(text || '').split('|').map(s => s.trim());
        const altText = escapeHtml(parts[0] || '');
        const widthRaw = parts[1] || '';
        const width = /^\d+$/.test(widthRaw) ? parseInt(widthRaw, 10) : 0;
        const alignRaw = (parts[2] || '').toLowerCase();
        const align = (alignRaw === 'left' || alignRaw === 'right') ? alignRaw : '';

        const titleAttr = title ? ` title="${escapeHtml(String(title || ''))}"` : '';
        const style = width ? ` style="max-width:${width}px; width:100%"` : '';
        const cls = align ? ` img-${align}` : '';

        // Caption: underscores → spaces
        const caption = (parts[0] || '').replace(/_/g, ' ').trim();

        const img = `<img src="${safeSrc}" alt="${altText}"${titleAttr}${style}` +
            ` class="post-img${cls}" loading="lazy" />`;

        if (caption) {
            return `<figure class="post-figure${cls}">` +
                `${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
        }
        return img;
    };
}

module.exports = { attachImageRenderer };
