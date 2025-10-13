const { marked } = require('marked');

const baseRenderer = new marked.Renderer();
const renderer = new marked.Renderer();

renderer.code = function codeRenderer(code, infostring, escaped) {
    const original = baseRenderer.code.call(this, code, infostring, escaped);
    const info = String(infostring || '').trim();

    // Support syntax: ```lang:filename  (filename is optional)
    // We only use the first token up to whitespace for parsing to keep behavior predictable
    const firstToken = info.split(/\s+/)[0];
    const [rawLanguage = '', rawFilename = ''] = firstToken.split(':', 2);

    const language = String(rawLanguage || '').toLowerCase();
    const safeLanguage = language.replace(/[^a-z0-9#+.\-_]/g, '');

    const filename = String(rawFilename || '');
    const safeFilename = escapeHtml(filename.slice(0, 160)); // avoid overly long labels

    // If no language, just emit a plain block with our base class for consistent styling
    if (!safeLanguage) {
        // Still render a filename header if author wrote ":filename" with empty language (rare)
        if (safeFilename) {
            return original
                .replace(
                    '<pre>',
                    `<div class="code-container">` +
                    `<div class="code-filename" title="${safeFilename}">${safeFilename}</div>` +
                    `<pre class="code-block">`
                )
                .replace('</pre>', `</pre></div>`);
        }
        return original.replace('<pre>', '<pre class="code-block">');
    }

    // Build optional filename header
    const filenameHeader = safeFilename
        ? `<div class="code-filename" title="${safeFilename}">${safeFilename}</div>`
        : '';

    // Add language label (displayed as a small pill) — rendered ABOVE the code box
    const languageHeader = `<div class="code-language">${safeLanguage}</div>`;

    const withContainer = original
        .replace(
            '<pre>',
            `<div class="code-container">${filenameHeader}<pre class="code-block language-${safeLanguage}">`
        )
        .replace('</pre>', `</pre></div>`);

    // Emit label outside the container so it appears above the box
    return `${languageHeader}${withContainer}`;
};

function escapeHtml(value = '') {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeImageSrc(src = '') {
    // Ensure src is a string before calling trim
    if (typeof src !== 'string') {
        return '';
    }

    const trimmed = src.trim();
    if (!trimmed) {
        return '';
    }

    // Allow data URLs, HTTP/HTTPS URLs, and local upload paths
    if (/^data:image\//i.test(trimmed)) {
        return trimmed;
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    if (/^\/uploads\//i.test(trimmed)) {
        return trimmed;
    }
    return '';
}

renderer.image = function imageRenderer(src, title, text) {
    // Handle both string and object src parameters
    let actualSrc = '';
    if (typeof src === 'string') {
        actualSrc = src;
    } else if (src && src.href) {
        actualSrc = src.href;
    } else {
        actualSrc = String(src || '');
    }

    const safeSrc = sanitizeImageSrc(actualSrc);

    if (!safeSrc) {
        return text ? escapeHtml(String(text || '')) : '';
    }

    const alt = escapeHtml(String(text || ''));
    const titleAttr = title ? ` title="${escapeHtml(String(title || ''))}"` : '';
    return `<img src="${safeSrc}" alt="${alt}"${titleAttr} loading="lazy" />`;
};

marked.use({
    mangle: false,
    headerIds: true,
    gfm: true,
    breaks: true, // Convert line breaks to <br>
    renderer,
});

function renderMarkdown(markdown) {
    const html = marked.parse(markdown || '');
    return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

module.exports = {
    renderMarkdown,
};
