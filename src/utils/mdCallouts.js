// ── Callout icons (small inline SVGs, Lucide-style) ──────────
// Each callout type gets a distinct icon and color (colors in CSS).

const CI = 'width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const CALLOUT_ICONS = {
    // Info circle
    note: `<svg ${CI}><circle cx="12" cy="12" r="10"/>` +
        `<line x1="12" y1="16" x2="12" y2="12"/>` +
        `<line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    // Lightbulb
    tip: `<svg ${CI}><line x1="9" y1="18" x2="15" y2="18"/>` +
        `<line x1="10" y1="22" x2="14" y2="22"/>` +
        `<path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 ` +
        `6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
    // Alert triangle
    warning: `<svg ${CI}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94` +
        `a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>` +
        `<line x1="12" y1="9" x2="12" y2="13"/>` +
        `<line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    // Exclamation circle
    important: `<svg ${CI}><circle cx="12" cy="12" r="10"/>` +
        `<line x1="12" y1="8" x2="12" y2="12"/>` +
        `<line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    // Flame
    caution: `<svg ${CI}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3` +
        `-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5` +
        `a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
};

module.exports = { CALLOUT_ICONS };
