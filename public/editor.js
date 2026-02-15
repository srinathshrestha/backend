// ── Editor: live markdown preview ─────────────────────────────
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

    setupPreview(textarea, previewOutput, previewStatus);
    setupHelpModal();
}

function setupPreview(textarea, previewOutput, previewStatus) {
    let timer;
    let controller;

    function setStatus(msg) {
        if (!previewStatus) return;
        previewStatus.hidden = !msg;
        previewStatus.textContent = msg || '';
    }

    function triggerPreview() {
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
    triggerPreview();
}
