// ── Media library: upload, copy, delete, and the lightbox viewer ──

document.addEventListener('DOMContentLoaded', function () {
    setupUpload();
    setupRowActions();
    setupLightbox();
});

function showError(msg) {
    const banner = document.getElementById('error-banner');
    if (!banner) return;
    banner.textContent = msg;
    banner.style.display = 'block';
    setTimeout(() => { banner.style.display = 'none'; }, 5000);
}

/** Copy text and briefly confirm on the button that asked for it. */
function copyWithFeedback(button, text) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => { button.textContent = orig; }, 1500);
    });
}

async function deleteKey(key) {
    const res = await fetch('/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');
}

// ── Upload ────────────────────────────────────────────────────
function setupUpload() {
    const input = document.getElementById('file-input');
    if (!input) return;

    input.addEventListener('change', async function () {
        const file = this.files[0];
        if (!file) return;
        const status = document.getElementById('upload-status');
        status.textContent = 'Uploading…';

        const fd = new FormData();
        fd.append('image', file);

        try {
            const res = await fetch('/admin/media/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Upload failed');
            status.textContent = 'Uploaded. Refreshing…';
            location.reload();
        } catch (err) {
            status.textContent = '';
            showError(err.message);
        }
        this.value = '';
    });
}

// ── Table row actions ─────────────────────────────────────────
function setupRowActions() {
    document.addEventListener('click', async function (e) {
        const copy = e.target.closest('.copy-btn');
        if (copy) {
            copyWithFeedback(copy, copy.dataset.url);
            return;
        }

        const del = e.target.closest('.del-btn[data-key]');
        if (del) {
            const key = del.dataset.key;
            if (!confirm('Delete "' + key + '" from S3? This cannot be undone.')) return;
            try {
                await deleteKey(key);
                const row = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
                if (row) row.remove();
            } catch (err) {
                showError(err.message);
            }
        }
    });
}

// ── Lightbox ──────────────────────────────────────────────────
function setupLightbox() {
    const box = document.querySelector('[data-lightbox]');
    if (!box) return;

    const stage = box.querySelector('[data-stage]');
    const img = box.querySelector('[data-lightbox-img]');
    const keyLabel = box.querySelector('[data-lightbox-key]');
    const zoomLevel = box.querySelector('[data-zoom-level]');
    const prevBtn = box.querySelector('[data-prev]');
    const nextBtn = box.querySelector('[data-next]');

    /** Rows are the source of truth — deleting one shrinks the set. */
    const rows = () => [...document.querySelectorAll('#media-table tbody tr')];

    let index = 0;
    let scale = 1;
    let panX = 0;
    let panY = 0;

    function applyTransform() {
        img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        img.classList.toggle('is-zoomed', scale > 1);
        zoomLevel.textContent = Math.round(scale * 100) + '%';
    }

    function setScale(next, originX, originY) {
        const clamped = Math.min(Math.max(next, 0.2), 8);
        if (clamped === scale) return;
        // Keep the point under the cursor stable while zooming.
        if (originX !== undefined) {
            const ratio = clamped / scale;
            panX = originX - (originX - panX) * ratio;
            panY = originY - (originY - panY) * ratio;
        }
        scale = clamped;
        if (scale <= 1) { panX = 0; panY = 0; }
        applyTransform();
    }

    function fit() {
        scale = 1; panX = 0; panY = 0;
        applyTransform();
    }

    function show(i) {
        const list = rows();
        if (!list.length) { close(); return; }
        index = Math.min(Math.max(i, 0), list.length - 1);
        const row = list[index];
        img.src = row.dataset.url;
        img.alt = row.dataset.key;
        keyLabel.textContent = row.dataset.key;
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === list.length - 1;
        fit();
    }

    function open(i) {
        box.hidden = false;
        document.body.style.overflow = 'hidden';
        show(i);
    }

    function close() {
        box.hidden = true;
        document.body.style.overflow = '';
    }

    // Open from a thumbnail
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-view]');
        if (!btn) return;
        const row = btn.closest('tr');
        open(rows().indexOf(row));
    });

    box.querySelector('[data-close]').addEventListener('click', close);
    prevBtn.addEventListener('click', () => show(index - 1));
    nextBtn.addEventListener('click', () => show(index + 1));

    box.querySelector('[data-zoom-in]').addEventListener('click', () => setScale(scale * 1.25));
    box.querySelector('[data-zoom-out]').addEventListener('click', () => setScale(scale / 1.25));
    box.querySelector('[data-zoom-fit]').addEventListener('click', fit);

    box.querySelector('[data-copy-url]').addEventListener('click', function () {
        copyWithFeedback(this, img.src);
    });
    box.querySelector('[data-copy-md]').addEventListener('click', function () {
        copyWithFeedback(this, `![${keyLabel.textContent}](${img.src})`);
    });
    box.querySelector('[data-delete]').addEventListener('click', async function () {
        const key = keyLabel.textContent;
        if (!confirm('Delete "' + key + '" from S3? This cannot be undone.')) return;
        try {
            await deleteKey(key);
            const row = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
            if (row) row.remove();
            const list = rows();
            if (!list.length) close();
            else show(Math.min(index, list.length - 1));
        } catch (err) {
            close();
            showError(err.message);
        }
    });

    // Backdrop click closes, but only outside the image itself.
    stage.addEventListener('click', function (e) {
        if (e.target === stage) close();
    });

    // Scroll to zoom, anchored at the pointer.
    stage.addEventListener('wheel', function (e) {
        if (box.hidden) return;
        e.preventDefault();
        const rect = stage.getBoundingClientRect();
        const ox = e.clientX - rect.left - rect.width / 2;
        const oy = e.clientY - rect.top - rect.height / 2;
        setScale(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), ox, oy);
    }, { passive: false });

    // Drag to pan once zoomed in.
    let dragging = false;
    let startX = 0;
    let startY = 0;

    img.addEventListener('pointerdown', function (e) {
        if (scale <= 1) return;
        dragging = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
        img.classList.add('is-dragging');
        img.setPointerCapture(e.pointerId);
    });
    img.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        applyTransform();
    });
    img.addEventListener('pointerup', function (e) {
        dragging = false;
        img.classList.remove('is-dragging');
        img.releasePointerCapture(e.pointerId);
    });

    // Double-click toggles between fit and 2x.
    img.addEventListener('dblclick', function () {
        if (scale > 1) fit();
        else setScale(2);
    });

    document.addEventListener('keydown', function (e) {
        if (box.hidden) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(index - 1);
        else if (e.key === 'ArrowRight') show(index + 1);
        else if (e.key === '+' || e.key === '=') setScale(scale * 1.25);
        else if (e.key === '-') setScale(scale / 1.25);
        else if (e.key === '0') fit();
    });
}
