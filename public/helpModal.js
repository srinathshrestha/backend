// ── Help modal: open/close logic ─────────────────────────────
// Opens the syntax reference popup from the ? button in the editor.

(function () {
    const toggle = document.querySelector('[data-help-toggle]');
    const overlay = document.querySelector('[data-help-overlay]');
    const closeBtn = document.querySelector('[data-help-close]');

    if (!toggle || !overlay) return;

    toggle.addEventListener('click', () => { overlay.hidden = false; });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => { overlay.hidden = true; });
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.hidden = true;
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
    });
})();
