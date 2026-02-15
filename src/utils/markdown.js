// ── Main markdown module ─────────────────────────────────────
// Wires together renderers, extensions, and footnotes.
// All heavy logic lives in the md*.js sub-modules.

const { marked } = require('marked');
const { renderer } = require('./mdRenderers');
const { attachImageRenderer } = require('./mdImages');
const { highlightExt, footnoteRefExt } = require('./mdExtensions');
const { extractFootnotes, buildFootnotesHtml } = require('./mdFootnotes');

// Attach image renderer (needs the renderer object from mdRenderers)
attachImageRenderer(renderer);

// Configure marked with all our custom pieces
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
    // 2. Parse markdown to HTML
    let html = marked.parse(cleaned);
    // 3. Append footnotes section if any
    html += buildFootnotesHtml(footnotes);
    // 4. Strip <script> tags for safety
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    return html;
}

module.exports = { renderMarkdown };
