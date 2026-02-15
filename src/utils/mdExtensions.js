// ── Inline marked extensions ─────────────────────────────────
// Highlight (==text==) and footnote references ([^id]).

const { escapeHtml } = require('./mdHelpers');

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

module.exports = { highlightExt, footnoteRefExt };
