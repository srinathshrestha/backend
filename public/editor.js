// ── Editor: live markdown preview, formatting toolbar, shortcuts ─
import { setupHelpModal } from './helpModal.js';

document.addEventListener('DOMContentLoaded', function () {
    initializeEditor();
});

function initializeEditor() {
    const root = document.querySelector('[data-editor-root]');
    if (!root) return;

    const textarea = root.querySelector('[data-markdown-input]');
    if (!textarea) return;

    const previewOutput = document.querySelector('[data-preview-output]');
    const previewStatus = document.querySelector('[data-preview-status]');
    const status = root.querySelector('[data-toolbar-status]');

    setupPreview(textarea, previewOutput, previewStatus, status);
    setupToolbar(root, textarea, status);
    setupShortcuts(textarea);
    setupHelpModal();
}

// ── Live preview + word count ─────────────────────────────────
function setupPreview(textarea, previewOutput, previewStatus, status) {
    let timer;
    let controller;

    function setStatus(msg) {
        if (!previewStatus) return;
        previewStatus.hidden = !msg;
        previewStatus.textContent = msg || '';
    }

    function updateWordCount() {
        if (!status) return;
        const words = (textarea.value.match(/\S+/g) || []).length;
        const minutes = Math.max(1, Math.round(words / 200));
        status.textContent = words
            ? `${words} words · ${minutes} min read`
            : '';
    }

    function triggerPreview() {
        updateWordCount();
        clearTimeout(timer);
        timer = setTimeout(() => requestPreview(textarea.value), 250);
    }

    async function requestPreview(markdown) {
        if (!previewOutput) return;
        if (!markdown || !markdown.trim()) {
            previewOutput.innerHTML = '<p class="muted">Start writing to see a live preview.</p>';
            setStatus('');
            return;
        }

        if (controller) controller.abort();
        controller = new AbortController();
        setStatus('Rendering preview…');

        try {
            const res = await fetch('/admin/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ markdown }),
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
            const data = await res.json();
            previewOutput.innerHTML = data.html || '<p class="muted">Nothing to preview yet.</p>';
            try { if (window.hljs) window.hljs.highlightAll(); } catch (e) {}
            setStatus('');
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Preview failed', err);
            setStatus('Preview unavailable. Try again later.');
            previewOutput.innerHTML = '<p class="muted">Preview unavailable.</p>';
        }
    }

    if (textarea) {
        textarea.addEventListener('input', triggerPreview);
        textarea.addEventListener('blur', triggerPreview);
    }
    updateWordCount();
    triggerPreview();
}

// ── Selection helpers ──────────────────────────────────────────
function fireInput(textarea) {
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
}

/** Wrap the current selection (or a placeholder) in before/after markers. */
function wrapSelection(textarea, before, after, placeholder) {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const selected = value.slice(start, end) || placeholder || '';
    textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
    fireInput(textarea);
}

/** Replace the current selection with literal text, cursor after it. */
function insertText(textarea, text) {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    fireInput(textarea);
}

/** Apply `fn(line, index)` to every line the selection spans, preserving
    the selection over the transformed block. */
function transformLines(textarea, fn) {
    const { selectionStart, selectionEnd, value } = textarea;
    let lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    let lineEnd = value.indexOf('\n', selectionEnd);
    if (lineEnd === -1) lineEnd = value.length;

    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n').map(fn);
    const next = lines.join('\n');

    textarea.value = value.slice(0, lineStart) + next + value.slice(lineEnd);
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineStart + next.length;
    fireInput(textarea);
}

// ── Toolbar actions ────────────────────────────────────────────
function setupToolbar(root, textarea, status) {
    const toolbar = root.querySelector('[data-editor-toolbar]');
    const imageInput = document.getElementById('editor-image-input');
    if (!toolbar) return;

    toolbar.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        runAction(btn.dataset.action, textarea, status, imageInput);
    });

    if (imageInput) {
        imageInput.addEventListener('change', function () {
            const file = this.files[0];
            this.value = '';
            if (file) uploadImage(file, textarea, status);
        });
    }
}

function runAction(action, textarea, status, imageInput) {
    switch (action) {
        case 'bold':      wrapSelection(textarea, '**', '**', 'bold text'); break;
        case 'italic':     wrapSelection(textarea, '*', '*', 'italic text'); break;
        case 'strike':     wrapSelection(textarea, '~~', '~~', 'strikethrough'); break;
        case 'code':       wrapSelection(textarea, '`', '`', 'code'); break;
        case 'mark':       wrapSelection(textarea, '==', '==', 'highlighted'); break;
        case 'codeblock':  wrapSelection(textarea, '\n```\n', '\n```\n', 'code here'); break;
        case 'link': {
            const url = window.prompt('Link URL', 'https://');
            if (url) wrapSelection(textarea, '[', `](${url})`, 'link text');
            break;
        }
        case 'image':
            if (imageInput) imageInput.click();
            break;
        case 'h2':      transformLines(textarea, (l) => (l.startsWith('## ') ? l : `## ${l}`)); break;
        case 'quote':   transformLines(textarea, (l) => `> ${l}`); break;
        case 'ul':      transformLines(textarea, (l) => (l.trim() ? `- ${l}` : l)); break;
        case 'ol': {
            let n = 1;
            transformLines(textarea, (l) => (l.trim() ? `${n++}. ${l}` : l));
            break;
        }
        case 'callout': {
            const { selectionStart: s, selectionEnd: e, value } = textarea;
            const selected = value.slice(s, e) || 'Write something.';
            const body = selected.split('\n').map((l) => `> ${l}`).join('\n');
            insertText(textarea, `> [!note] Note\n${body}\n`);
            break;
        }
        case 'footnote': {
            const used = [...textarea.value.matchAll(/\[\^(\d+)\]/g)].map((m) => parseInt(m[1], 10));
            const next = used.length ? Math.max(...used) + 1 : 1;
            insertText(textarea, `[^${next}]`);
            textarea.value += `\n\n[^${next}]: `;
            textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
            fireInput(textarea);
            break;
        }
        default: break;
    }
}

async function uploadImage(file, textarea, status) {
    const prev = status ? status.textContent : '';
    if (status) { status.textContent = 'Uploading image…'; status.dataset.variant = ''; }

    const fd = new FormData();
    fd.append('image', file);

    try {
        const res = await fetch('/admin/media/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');
        insertText(textarea, data.markdown);
        if (status) { status.textContent = 'Image uploaded'; status.dataset.variant = 'success'; }
    } catch (err) {
        if (status) { status.textContent = err.message || 'Upload failed'; status.dataset.variant = 'error'; }
    } finally {
        setTimeout(() => {
            if (status) { status.dataset.variant = ''; status.textContent = prev; }
        }, 2000);
    }
}

// ── Keyboard shortcuts ─────────────────────────────────────────
function setupShortcuts(textarea) {
    textarea.addEventListener('keydown', function (e) {
        const meta = e.metaKey || e.ctrlKey;

        if (meta && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            wrapSelection(textarea, '**', '**', 'bold text');
            return;
        }
        if (meta && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            wrapSelection(textarea, '*', '*', 'italic text');
            return;
        }
        if (meta && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const url = window.prompt('Link URL', 'https://');
            if (url) wrapSelection(textarea, '[', `](${url})`, 'link text');
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                transformLines(textarea, (l) => l.replace(/^(\t| {1,2})/, ''));
            } else {
                transformLines(textarea, (l) => `  ${l}`);
            }
        }
    });
}
