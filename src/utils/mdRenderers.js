// ── Custom marked renderers ──────────────────────────────────
// Callouts, heading anchors, code blocks, images, tables.

const { marked } = require('marked');
const { escapeHtml, sanitizeImageSrc } = require('./mdHelpers');
const { CALLOUT_ICONS } = require('./mdCallouts');

const baseRenderer = new marked.Renderer();
const renderer = new marked.Renderer();

// ── Callouts: blockquotes starting with [!type] ─────────────
renderer.blockquote = function (quote) {
    const match = quote.match(/^<p>\[!(note|tip|warning|important|caution)\]\s*/i);
    if (!match) return `<blockquote>${quote}</blockquote>\n`;

    const type = match[1].toLowerCase();
    const rest = quote.slice(match[0].length);
    const breakIdx = rest.search(/<br\s*\/?>|<\/p>/);
    const title = (breakIdx > 0
        ? rest.slice(0, breakIdx)
        : rest.replace(/<\/p>[\s\S]*$/, '')
    ).trim() || (type.charAt(0).toUpperCase() + type.slice(1));

    let body = breakIdx > 0 ? rest.slice(breakIdx).replace(/^<br\s*\/?>/, '') : '';
    body = body.trim();

    const icon = CALLOUT_ICONS[type] || '';
    return `<div class="callout callout-${type}">` +
        `<div class="callout-title">${icon}<span>${title}</span></div>` +
        (body ? `<div class="callout-body">${body}</div>` : '') +
        `</div>\n`;
};

// ── Heading anchors ──────────────────────────────────────────
renderer.heading = function (text, level, raw, slugger) {
    const slug = slugger.slug(raw);
    return `<h${level} id="${slug}">` +
        `<a class="heading-anchor" href="#${slug}" aria-hidden="true">#</a>` +
        `${text}</h${level}>\n`;
};

// ── Code blocks: language pill + optional filename bar ───────
renderer.code = function codeRenderer(code, infostring, escaped) {
    const original = baseRenderer.code.call(this, code, infostring, escaped);
    const info = String(infostring || '').trim();
    const firstToken = info.split(/\s+/)[0];
    const [rawLang = '', rawFile = ''] = firstToken.split(':', 2);
    const lang = String(rawLang || '').toLowerCase().replace(/[^a-z0-9#+.\-_]/g, '');
    const file = escapeHtml(String(rawFile || '').slice(0, 160));

    if (!lang) {
        if (file) {
            return original
                .replace('<pre>',
                    `<div class="code-container">` +
                    `<div class="code-filename" title="${file}">${file}</div>` +
                    `<pre class="code-block">`)
                .replace('</pre>', `</pre></div>`);
        }
        return original.replace('<pre>', '<pre class="code-block">');
    }

    const fileHeader = file ? `<div class="code-filename" title="${file}">${file}</div>` : '';
    const pill = `<span class="code-language">${lang}</span>`;
    return original
        .replace('<pre>',
            `<div class="code-container">${fileHeader}${pill}` +
            `<pre class="code-block language-${lang}">`)
        .replace('</pre>', `</pre></div>`);
};

// ── Tables: scrollable wrapper ───────────────────────────────
renderer.table = function tableRenderer(header, body) {
    return `<div class="table-wrap"><table>\n` +
        `<thead>\n${header}</thead>\n` +
        (body ? `<tbody>\n${body}</tbody>\n` : '') +
        `</table></div>\n`;
};

module.exports = { renderer };
