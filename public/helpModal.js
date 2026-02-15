// ── Help modal: open/close logic ─────────────────────────────
// Opens the syntax reference popup from the ? button in the editor.

export function setupHelpModal() {
    const toggle = document.querySelector('[data-help-toggle]');
    const overlay = document.querySelector('[data-help-overlay]');
    const closeBtn = document.querySelector('[data-help-close]');

    if (!toggle || !overlay) return;

    // Open modal
    toggle.addEventListener('click', () => { overlay.hidden = false; });

    // Close via X button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => { overlay.hidden = true; });
    }

    // Close when clicking the dark backdrop (not the modal itself)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.hidden = true;
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
    });
}
