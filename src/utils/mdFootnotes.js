// ── Footnote extraction and rendering ────────────────────────
// Obsidian-style: [^id] for references, [^id]: content for definitions.
// Definitions are extracted BEFORE marked parses, then appended at the end.

const { marked } = require('marked');
const { escapeHtml } = require('./mdHelpers');

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

module.exports = { extractFootnotes, buildFootnotesHtml };
