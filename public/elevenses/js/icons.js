// Game icons (inline SVG). Colours come from CSS custom properties so they adapt to themes.
export const LOGO = `<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
  <path d="M17 6c-2 2.5 2 4.5 0 7M24 4c-2 2.5 2 4.5 0 7M31 6c-2 2.5 2 4.5 0 7" fill="none" stroke="var(--brand-2)" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M8 18h30v6a15 15 0 0 1-30 0z" fill="var(--brand)"/>
  <path d="M38 21h2.5a5 5 0 0 1 0 10H36" fill="none" stroke="var(--brand)" stroke-width="3.2"/>
  <path d="M5 42h36" stroke="var(--brand)" stroke-width="3.2" stroke-linecap="round"/>
</svg>`;

export const GAME_ICONS = {
  mini: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="5" fill="var(--icon-bg)"/>
    <g fill="#fff">${[0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4].map((c) => ((r === 0 && c === 0) || (r === 4 && c === 4) || (r === 0 && c === 1) || (r === 4 && c === 3) ? '' : `<rect x="${6.2 + c * 5.8}" y="${6.2 + r * 5.8}" width="4.9" height="4.9" rx=".8"/>`))).join('')}</g></svg>`,
  midi: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="5" fill="var(--icon-bg)"/>
    <g fill="#fff">${[0, 1, 2, 3, 4, 5, 6].flatMap((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => (r % 2 && c % 2 ? '' : (r === 0 && c === 3) || (r === 6 && c === 3) ? '' : `<rect x="${6.4 + c * 3.95}" y="${6.4 + r * 3.95}" width="3.3" height="3.3" rx=".5"/>`))).join('')}</g></svg>`,
  inkling: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="5" fill="var(--icon-bg)"/>
    <rect x="7" y="8" width="12" height="11" rx="2" fill="#fff"/><rect x="21" y="8" width="12" height="11" rx="2" fill="var(--ink-present)"/>
    <rect x="7" y="21" width="12" height="11" rx="2" fill="var(--ink-correct-2)"/><rect x="21" y="21" width="12" height="11" rx="2" fill="#fff"/></svg>`,
  spokes: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="5" fill="var(--icon-bg)"/>
    <circle cx="20" cy="20" r="12.5" fill="#fff"/>
    <g stroke="var(--icon-bg)" stroke-width="1.6">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = (k * Math.PI) / 4 + Math.PI / 8; return `<line x1="${20 + 4.5 * Math.cos(a)}" y1="${20 + 4.5 * Math.sin(a)}" x2="${20 + 12.5 * Math.cos(a)}" y2="${20 + 12.5 * Math.sin(a)}"/>`; }).join('')}</g>
    <circle cx="20" cy="20" r="4.8" fill="var(--hub)" stroke="#fff" stroke-width="1.4"/></svg>`,
  quartets: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="5" fill="var(--icon-bg)"/>
    <rect x="7" y="7" width="12" height="12" rx="2.5" fill="var(--q1)"/><rect x="21" y="7" width="12" height="12" rx="2.5" fill="var(--q2)"/>
    <rect x="7" y="21" width="12" height="12" rx="2.5" fill="var(--q3)"/><rect x="21" y="21" width="12" height="12" rx="2.5" fill="#fff"/></svg>`,
  ramble: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="5" fill="var(--icon-bg)"/>
    <path d="M10.5 10.5 L20 10.5 L29.5 20 L20 29.5 L10.5 29.5" fill="none" stroke="var(--ramble-path)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="#fff">${[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<circle cx="${10.5 + c * 9.5}" cy="${10.5 + r * 9.5}" r="2.9"/>`)).join('')}</g></svg>`,
};
