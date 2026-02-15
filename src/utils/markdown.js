const { marked } = require('marked');

// ── Helpers ──────────────────────────────────────────────────

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

// ── Footnotes ────────────────────────────────────────────────
// Obsidian-style: [^id] for references, [^id]: content for definitions.
// We extract definitions BEFORE marked parses, then append them at the end.

/** Strip [^id]: content lines from raw markdown, return map of definitions */
function extractFootnotes(md) {
    const footnotes = {};
    const cleaned = md.replace(/^\[\^([^\]]+)\]:\s+(.+)$/gm, (_, id, content) => {
        footnotes[id] = content;
        return ''; // remove definition line from source
    });
    return { cleaned, footnotes };
}

/** Build a <section class="footnotes"> from collected definitions */
function buildFootnotesHtml(footnotes) {
    const ids = Object.keys(footnotes);
    if (!ids.length) return '';
    const items = ids.map((id) => {
        // Parse content as inline markdown so links, bold, etc. work
        const content = marked.parseInline(footnotes[id] || '');
        const safeId = escapeHtml(id);
        return `<li id="fn-${safeId}"><span>${content}</span> ` +
            `<a href="#fnref-${safeId}" class="fn-backref" title="Back to text">↩</a></li>`;
    }).join('\n');
    return `\n<section class="footnotes"><hr><ol>\n${items}\n</ol></section>`;
}

// ── Callout icons (small inline SVGs, Lucide-style) ──────────
// Shared SVG attributes to keep things compact
const CI = 'width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const CALLOUT_ICONS = {
    // Info circle
    note: `<svg ${CI}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    // Lightbulb
    tip: `<svg ${CI}><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
    // Alert triangle
    warning: `<svg ${CI}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    // Exclamation circle
    important: `<svg ${CI}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    // Flame
    caution: `<svg ${CI}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
};

// ── Renderers ────────────────────────────────────────────────

const baseRenderer = new marked.Renderer();
const renderer = new marked.Renderer();

/**
 * Callouts — Obsidian-style blockquotes that start with [!type].
 * Transforms > [!note] Title\n> body  into a styled callout div.
 */
renderer.blockquote = function (quote) {
    // Detect callout pattern at the start of the blockquote HTML
    const match = quote.match(/^<p>\[!(note|tip|warning|important|caution)\]\s*/i);
    if (!match) {
        return `<blockquote>${quote}</blockquote>\n`;
    }

    const type = match[1].toLowerCase();
    const rest = quote.slice(match[0].length); // everything after [!type]

    // Title = text before the first <br> or </p>
    const breakIdx = rest.search(/<br\s*\/?>|<\/p>/);
    const title = (breakIdx > 0
        ? rest.slice(0, breakIdx)
        : rest.replace(/<\/p>[\s\S]*$/, '')
    ).trim() || (type.charAt(0).toUpperCase() + type.slice(1));

    // Body = everything after the title line
    let body = breakIdx > 0
        ? rest.slice(breakIdx).replace(/^<br\s*\/?>/, '')
        : '';
    body = body.trim();

    const icon = CALLOUT_ICONS[type] || '';
    return `<div class="callout callout-${type}">` +
        `<div class="callout-title">${icon}<span>${title}</span></div>` +
        (body ? `<div class="callout-body">${body}</div>` : '') +
        `</div>\n`;
};

/**
 * Heading anchors — every heading gets an id and a small # link.
 * Lets readers copy a direct URL to any section.
 */
renderer.heading = function (text, level, raw, slugger) {
    const slug = slugger.slug(raw);
    return `<h${level} id="${slug}">` +
        `<a class="heading-anchor" href="#${slug}" aria-hidden="true">#</a>` +
        `${text}</h${level}>\n`;
};

/**
 * Code blocks — language pill + optional filename bar (existing).
 * Syntax: ```lang:filename
 */
renderer.code = function codeRenderer(code, infostring, escaped) {
    const original = baseRenderer.code.call(this, code, infostring, escaped);
    const info = String(infostring || '').trim();

    // Support syntax: ```lang:filename  (filename is optional)
    const firstToken = info.split(/\s+/)[0];
    const [rawLanguage = '', rawFilename = ''] = firstToken.split(':', 2);
    const language = String(rawLanguage || '').toLowerCase();
    const safeLanguage = language.replace(/[^a-z0-9#+.\-_]/g, '');
    const safeFilename = escapeHtml(String(rawFilename || '').slice(0, 160));

    // No language — plain code block
    if (!safeLanguage) {
        if (safeFilename) {
            return original
                .replace('<pre>',
                    `<div class="code-container">` +
                    `<div class="code-filename" title="${safeFilename}">${safeFilename}</div>` +
                    `<pre class="code-block">`)
                .replace('</pre>', `</pre></div>`);
        }
        return original.replace('<pre>', '<pre class="code-block">');
    }

    // Build filename header + language pill (pill sits inside the container)
    const filenameHeader = safeFilename
        ? `<div class="code-filename" title="${safeFilename}">${safeFilename}</div>` : '';
    const languagePill = `<span class="code-language">${safeLanguage}</span>`;

    return original
        .replace('<pre>',
            `<div class="code-container">` +
            `${filenameHeader}${languagePill}` +
            `<pre class="code-block language-${safeLanguage}">`)
        .replace('</pre>', `</pre></div>`);
};

/**
 * Images — sanitize src, support local /uploads/ paths.
 *
 * Custom sizing/alignment syntax in the alt text:
 *   ![alt|width|align](/path)
 *
 * Examples:
 *   ![diagram|600](/uploads/2026/pic.png)         → 600px wide, centered
 *   ![photo|400|left](/uploads/2026/pic.png)      → 400px wide, left-aligned
 *   ![chart|500|right](/uploads/2026/pic.png)     → 500px wide, right-aligned
 *   ![normal image](/uploads/2026/pic.png)        → default (full-width, centered)
 */
renderer.image = function imageRenderer(src, title, text) {
    let actualSrc = '';
    if (typeof src === 'string') actualSrc = src;
    else if (src && src.href) actualSrc = src.href;
    else actualSrc = String(src || '');

    const safeSrc = sanitizeImageSrc(actualSrc);
    if (!safeSrc) return text ? escapeHtml(String(text || '')) : '';

    // Parse alt text for size/alignment: alt|width|align
    const rawAlt = String(text || '');
    const parts = rawAlt.split('|').map(s => s.trim());
    const altText = escapeHtml(parts[0] || '');

    // Width: must be a number (pixels)
    const widthRaw = parts[1] || '';
    const width = /^\d+$/.test(widthRaw) ? parseInt(widthRaw, 10) : 0;

    // Alignment: only "left" or "right" allowed
    const alignRaw = (parts[2] || '').toLowerCase();
    const align = (alignRaw === 'left' || alignRaw === 'right') ? alignRaw : '';

    const titleAttr = title ? ` title="${escapeHtml(String(title || ''))}"` : '';

    // Build inline style for width
    const style = width ? ` style="max-width:${width}px; width:100%"` : '';

    // Build alignment class
    const cls = align ? ` img-${align}` : '';

    // Caption: alt text with underscores replaced by spaces
    const caption = (parts[0] || '').replace(/_/g, ' ').trim();

    const img = `<img src="${safeSrc}" alt="${altText}"${titleAttr}${style}` +
        ` class="post-img${cls}" loading="lazy" />`;

    // Wrap in <figure> with a caption if alt text exists
    if (caption) {
        return `<figure class="post-figure${cls}">` +
            `${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
    }
    return img;
};

/**
 * Tables — wrap in a scrollable container so wide tables don't
 * break the layout on small screens.
 */
renderer.table = function tableRenderer(header, body) {
    return `<div class="table-wrap"><table>\n` +
        `<thead>\n${header}</thead>\n` +
        (body ? `<tbody>\n${body}</tbody>\n` : '') +
        `</table></div>\n`;
};

// ── Inline extensions ────────────────────────────────────────

/** Highlight — ==text== renders as <mark>text</mark> (Obsidian-style) */
const highlightExt = {
    name: 'highlight',
    level: 'inline',
    start(src) { return src.indexOf('=='); },
    tokenizer(src) {
        const m = /^==(?!=)(.+?)(?<!=)==/.exec(src);
        if (m) return { type: 'highlight', raw: m[0], text: m[1] };
    },
    renderer(token) { return `<mark>${escapeHtml(token.text)}</mark>`; },
};

/** Footnote reference — [^id] renders as a superscript link */
const footnoteRefExt = {
    name: 'footnoteRef',
    level: 'inline',
    start(src) { return src.indexOf('[^'); },
    tokenizer(src) {
        const m = /^\[\^([^\]]+)\](?!:)/.exec(src);
        if (m) return { type: 'footnoteRef', raw: m[0], id: m[1] };
    },
    renderer(token) {
        const id = escapeHtml(token.id);
        return `<sup class="fn-ref"><a href="#fn-${id}" id="fnref-${id}">[${id}]</a></sup>`;
    },
};

// ── Configure marked ─────────────────────────────────────────

marked.use({
    mangle: false,
    headerIds: false, // we handle heading IDs in our custom renderer
    gfm: true,
    breaks: true,     // single newlines become <br>
    renderer,
    extensions: [highlightExt, footnoteRefExt],
});

// ── Main export ──────────────────────────────────────────────

function renderMarkdown(markdown) {
    // 1. Extract footnote definitions before parsing
    const { cleaned, footnotes } = extractFootnotes(markdown || '');
    // 2. Parse markdown to HTML (callouts, highlights, anchors all run here)
    let html = marked.parse(cleaned);
    // 3. Append footnotes section if any definitions were found
    html += buildFootnotesHtml(footnotes);
    // 4. Strip <script> tags for safety
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    return html;
}

module.exports = { renderMarkdown };
