// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function () {
    initializeEditor();
});

function initializeEditor() {
    const root = document.querySelector('[data-editor-root]');
    if (!root) {
        return;
    }

    const textarea = root.querySelector('[data-markdown-input]');
    if (!textarea) {
        return;
    }

    const previewOutput = document.querySelector('[data-preview-output]');
    const previewStatus = document.querySelector('[data-preview-status]');

    // Initialize editor functionality
    setupEditor(textarea, previewOutput, previewStatus);

    // Initialize help modal (syntax reference popup)
    setupHelpModal();
}

// ── Help modal: open/close logic ─────────────────────────────
function setupHelpModal() {
    const toggle = document.querySelector('[data-help-toggle]');
    const overlay = document.querySelector('[data-help-overlay]');
    const closeBtn = document.querySelector('[data-help-close]');

    if (!toggle || !overlay) return;

    // Open modal
    toggle.addEventListener('click', () => {
        overlay.hidden = false;
    });

    // Close via X button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay.hidden = true;
        });
    }

    // Close when clicking the dark backdrop (not the modal itself)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.hidden = true;
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) {
            overlay.hidden = true;
        }
    });
}

function setupEditor(textarea, previewOutput, previewStatus) {
    let previewTimer;
    let previewController;

    function setPreviewStatus(message) {
        if (!previewStatus) return;
        if (!message) {
            previewStatus.hidden = true;
            previewStatus.textContent = '';
            return;
        }
        previewStatus.hidden = false;
        previewStatus.textContent = message;
    }

    function triggerPreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
            requestPreview(textarea.value);
        }, 250);
    }

    async function requestPreview(markdown) {
        if (!previewOutput) return;

        // Don't preview empty content
        if (!markdown || markdown.trim() === '') {
            previewOutput.innerHTML = '<p class="muted">Start writing to see a live preview.</p>';
            setPreviewStatus('');
            return;
        }

        if (previewController) {
            previewController.abort();
        }

        previewController = new AbortController();
        setPreviewStatus('Rendering preview…');

        try {
            const response = await fetch('/admin/preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ markdown }),
                signal: previewController.signal,
            });

            if (!response.ok) {
                throw new Error(`Preview failed with status ${response.status}`);
            }

            const data = await response.json();
            previewOutput.innerHTML = data.html || '<p class="muted">Nothing to preview yet.</p>';
            try { if (window.hljs) { window.hljs.highlightAll(); } } catch (e) { }
            setPreviewStatus('');
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            console.error('Preview failed', error);
            setPreviewStatus('Preview unavailable. Try again later.');
            previewOutput.innerHTML = '<p class="muted">Preview unavailable. Check your markdown syntax.</p>';
        }
    }

    // Live preview on typing
    if (textarea) {
        textarea.addEventListener('input', triggerPreview);
        textarea.addEventListener('blur', triggerPreview);
    }

    // Kick off preview once on load so server-rendered HTML stays in sync
    triggerPreview();
}