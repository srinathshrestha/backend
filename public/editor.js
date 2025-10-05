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

    const toolbar = root.querySelector('[data-editor-toolbar]');
    const uploadStatus = root.querySelector('[data-upload-status]');
    const fileInput = root.querySelector('[data-image-input]');
    const previewOutput = document.querySelector('[data-preview-output]');
    const previewStatus = document.querySelector('[data-preview-status]');

    // Initialize editor functionality
    setupEditor(textarea, toolbar, uploadStatus, fileInput, previewOutput, previewStatus);
}

function setupEditor(textarea, toolbar, uploadStatus, fileInput, previewOutput, previewStatus) {
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
    let previewTimer;
    let previewController;

    function setUploadStatus(message, variant = 'info') {
        if (!uploadStatus) return;
        if (!message) {
            uploadStatus.textContent = '';
            uploadStatus.dataset.variant = '';
            return;
        }
        uploadStatus.textContent = message;
        uploadStatus.dataset.variant = variant;
    }

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

    function replaceSelection(before, after = before, defaultText = '') {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentValue = textarea.value;
        const selected = currentValue.slice(start, end) || defaultText;
        const nextValue =
            currentValue.slice(0, start) + before + selected + after + currentValue.slice(end);
        textarea.value = nextValue;
        const cursor = start + before.length + selected.length;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(cursor, cursor);
            triggerPreview();
        });
    }

    async function uploadImage(file) {
        if (!file) {
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            setUploadStatus('Max file size is 5 MB', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('image', file);

        setUploadStatus('Uploading image…', 'info');

        try {
            const response = await fetch('/admin/media/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || 'Upload failed');
            }

            const payload = await response.json();

            // Insert image at cursor position with proper spacing
            const imageMarkdown = `![${file.name}](${payload.url})`;
            const before = textarea.selectionStart === 0 ? '' : '\n';
            const after = '\n';

            replaceSelection(before + imageMarkdown + after, '', '');
            setUploadStatus('Image uploaded', 'success');
            setTimeout(() => setUploadStatus(''), 2000);
        } catch (error) {
            console.error('Image upload failed', error);
            setUploadStatus(error.message || 'Image upload failed', 'error');
        } finally {
            if (fileInput) {
                fileInput.value = '';
            }
        }
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

    // Toolbar click handler
    if (toolbar) {
        toolbar.addEventListener('click', (event) => {
            const button = event.target.closest('[data-command]');
            if (!button) return;
            event.preventDefault();
            const command = button.dataset.command;

            if (command === 'image') {
                if (fileInput) {
                    fileInput.click();
                }
            }
        });
    }

    // File input change handler
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                uploadImage(file);
            }
        });
    }

    // Enhanced paste support for images
    if (textarea) {
        textarea.addEventListener('paste', async (event) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    event.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        await uploadImage(file);
                    }
                    return;
                }
            }
        });
    }

    // Keyboard shortcuts
    if (textarea) {
        textarea.addEventListener('keydown', (event) => {
            // Ctrl/Cmd + Shift + I for image upload
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'I') {
                event.preventDefault();
                if (fileInput) {
                    fileInput.click();
                }
            }
        });

        textarea.addEventListener('input', triggerPreview);
        textarea.addEventListener('blur', triggerPreview);
    }

    // Kick off preview once on load so server-rendered HTML stays in sync
    triggerPreview();
}