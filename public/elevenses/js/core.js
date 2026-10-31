// Elevenses — shared core: DOM helper, dates, storage, data loading, UI primitives.

/* ---------------- DOM ---------------- */
export function h(tag, props, ...children) {
  const el = tag === 'svg' || props?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false || k === 'svg') continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export function svg(markup, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild;
  if (cls) el.classList.add(...cls.split(' '));
  return el;
}

/* ---------------- Dates ---------------- */
export const EPOCH = '2026-09-01';
export const LAST = '2030-12-31';
const MS_DAY = 86400000;
const toUTC = (d) => Date.parse(d + 'T00:00:00Z');
export function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
export const addDays = (d, n) => new Date(toUTC(d) + n * MS_DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / MS_DAY);
export const puzzleNo = (d) => daysBetween(EPOCH, d) + 1;
export const isPlayable = (d) => d >= EPOCH && d <= today() && d <= LAST;
const fmt = (d, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(toUTC(d)));
export const longDate = (d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (d) => fmt(d, { day: 'numeric', month: 'short', year: 'numeric' });
export const dayMonth = (d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
export const monthName = (d) => fmt(d, { month: 'long', year: 'numeric' });
export function msToMidnight() {
  const n = new Date();
  const m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  return m - n;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}
export function fmtCountdown(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/* ---------------- Hash ---------------- */
export function hash(str) {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    x ^= str.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Storage ---------------- */
const KEY = 'elevenses.v1';
let db;
function load() {
  try {
    db = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    db = {};
  }
  db.settings ??= { theme: 'auto', inklingHard: false, showTimer: true, autocheck: false };
  db.games ??= {};
  return db;
}
load();
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}
export function flush() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable (private mode) — keep in memory */
  }
}
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.hidden && flush());

export const store = {
  settings: () => db.settings,
  setSetting(k, v) {
    db.settings[k] = v;
    persist();
  },
  get: (game, date) => db.games[game]?.[date],
  set(game, date, state) {
    (db.games[game] ??= {})[date] = state;
    persist();
  },
  all: (game) => db.games[game] || {},
  exportJSON: () => JSON.stringify({ app: 'elevenses', version: 1, exported: new Date().toISOString(), ...db }),
  importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.games) throw new Error('That doesn’t look like an Elevenses backup.');
    for (const [g, days] of Object.entries(obj.games)) {
      db.games[g] ??= {};
      for (const [d, st] of Object.entries(days)) {
        const cur = db.games[g][d];
        // keep whichever record is further along
        if (!cur || (!cur.done && st.done) || (st.progress ?? 0) > (cur.progress ?? 0)) db.games[g][d] = st;
      }
    }
    if (obj.settings) Object.assign(db.settings, obj.settings);
    flush();
  },
  reset() {
    db = { settings: db.settings, games: {} };
    flush();
  },
};

/* ---------------- Stats helpers ---------------- */
/** Streaks over records where `pred(record)` holds and the puzzle was completed on its own day. */
export function streaks(records, pred) {
  const good = (d) => {
    const r = records[d];
    return r && r.onDay && pred(r);
  };
  let current = 0;
  let d = today();
  if (!good(d)) d = addDays(d, -1);
  while (d >= EPOCH && good(d)) {
    current++;
    d = addDays(d, -1);
  }
  let max = 0, run = 0, prev = null;
  for (const date of Object.keys(records).sort()) {
    if (!good(date)) { run = 0; prev = date; continue; }
    run = prev && addDays(prev, 1) === date && good(prev) ? run + 1 : 1;
    max = Math.max(max, run);
    prev = date;
  }
  return { current, max: Math.max(max, current) };
}

/* ---------------- Data ---------------- */
const jsonCache = new Map();
export async function fetchJSON(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(
      path,
      fetch(path).then((r) => {
        if (!r.ok) throw new Error(`Couldn’t load ${path} (${r.status})`);
        return r.json();
      }),
    );
    jsonCache.get(path).catch(() => jsonCache.delete(path));
  }
  return jsonCache.get(path);
}
export async function dayData(game, date) {
  const file = await fetchJSON(`data/${game}/${date.slice(0, 4)}.json`);
  const i = daysBetween(file.first, date);
  const d = file.days[i];
  if (d == null) throw new Error('No puzzle for this date yet.');
  return d;
}
const wordSets = new Map();
export function wordSet(file) {
  if (!wordSets.has(file)) {
    const p = fetch(`data/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error('Couldn’t load the dictionary');
        return r.text();
      })
      .then((t) => new Set(t.split('\n')));
    wordSets.set(file, p);
    p.catch(() => wordSets.delete(file));
  }
  return wordSets.get(file);
}

/* ---------------- UI primitives ---------------- */
let toastHost;
export function toast(msg, { ms = 1600, tone = '' } = {}) {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${tone}` }, msg);
  // One message at a time: older toasts make way.
  for (const old of toastHost.children) {
    old.classList.remove('in');
    setTimeout(() => old.remove(), 200);
  }
  toastHost.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 250);
  }, ms);
}

let openModal = null;
export function modal(content, { title, cls = '', onClose } = {}) {
  closeModal();
  const close = () => closeModal();
  const sheet = h(
    'div',
    { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    h('button', { class: 'sheet-close icon-btn', 'aria-label': 'Close', onclick: close, html: ICON.close }),
    title ? h('h2', { class: 'sheet-title' }, title) : null,
    content,
  );
  const backdrop = h('div', { class: 'backdrop', onclick: (e) => e.target === backdrop && close() }, sheet);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('in'));
  openModal = { backdrop, onClose };
  return { close };
}
export function closeModal() {
  if (!openModal) return;
  const { backdrop, onClose } = openModal;
  openModal = null;
  backdrop.classList.remove('in');
  setTimeout(() => backdrop.remove(), 220);
  onClose?.();
}
addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());
export const modalOpen = () => !!openModal;

export async function share(text) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Couldn’t copy — sorry!');
  }
}

/** Stat tiles row. items: [[value, label], ...] */
export function statRow(items) {
  return h('div', { class: 'stat-row' }, items.map(([v, l]) => h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, v), h('div', { class: 'stat-l' }, l))));
}
/** Horizontal bar distribution. rows: [[label, count, highlight]] */
export function distribution(rows) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return h(
    'div',
    { class: 'dist' },
    rows.map(([label, n, hi]) =>
      h('div', { class: 'dist-row' }, h('span', { class: 'dist-l' }, label), h('div', { class: 'dist-bar-wrap' }, h('div', { class: `dist-bar ${hi ? 'hi' : ''}`, style: { width: `${Math.max(7, (n / max) * 100)}%` } }, n))),
    ),
  );
}
export function countdownEl() {
  const el = h('span', { class: 'countdown' }, fmtCountdown(msToMidnight()));
  const t = setInterval(() => {
    if (!el.isConnected) return clearInterval(t);
    el.textContent = fmtCountdown(msToMidnight());
  }, 1000);
  return el;
}

/** Simple confetti burst using CSS-animated spans. */
export function confetti(colors = ['#3E8E63', '#E0A030', '#5B8DEF', '#D9483B', '#8E6CCF']) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 70; i++) {
    host.append(
      h('i', {
        style: {
          left: `${Math.random() * 100}%`,
          background: colors[i % colors.length],
          animationDelay: `${Math.random() * 0.4}s`,
          animationDuration: `${1.6 + Math.random() * 1.4}s`,
          transform: `rotate(${Math.random() * 360}deg)`,
        },
      }),
    );
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 3400);
}

/* ---------------- Icons ---------------- */
export const ICON = {
  back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  help: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 4"/><circle cx="12" cy="17.4" r=".6" fill="currentColor"/></svg>',
  stats: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  backspace: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9.5l-5 5M12 9.5l5 5"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
};

/** Icon button helper */
export const iconBtn = (name, label, onclick, extra = '') => h('button', { class: `icon-btn ${extra}`, 'aria-label': label, title: label, onclick, html: ICON[name] });

/** Onscreen QWERTY keyboard. onKey(key) receives 'a'..'z', 'enter', 'back'. */
export function keyboard(onKey, { enter = true, enterLabel = 'Enter' } = {}) {
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const keys = {};
  const kb = h(
    'div',
    { class: 'kb', role: 'group', 'aria-label': 'Keyboard' },
    rows.map((row, i) =>
      h(
        'div',
        { class: 'kb-row' },
        i === 1 ? h('div', { class: 'kb-spacer' }) : null,
        i === 2 && enter ? h('button', { class: 'kb-key wide', 'data-k': 'enter', type: 'button' }, enterLabel) : null,
        row.split('').map((ch) => (keys[ch] = h('button', { class: 'kb-key', 'data-k': ch, type: 'button' }, ch))),
        i === 2 ? h('button', { class: `kb-key ${enter ? 'wide' : 'wider'}`, 'data-k': 'back', type: 'button', 'aria-label': 'Delete', html: ICON.backspace }) : null,
        i === 1 ? h('div', { class: 'kb-spacer' }) : null,
      ),
    ),
  );
  // pointerdown for snappy response on iOS
  kb.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    e.preventDefault();
    b.classList.add('down');
    setTimeout(() => b.classList.remove('down'), 110);
    onKey(b.dataset.k);
  });
  kb.addEventListener('click', (e) => e.preventDefault());
  return { el: kb, keys };
}

/** Physical keyboard listener that is removed when `alive()` turns false. */
export function onPhysicalKeys(handler, alive) {
  const fn = (e) => {
    if (!alive()) return removeEventListener('keydown', fn);
    if (modalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea')) return;
    let k = null;
    if (e.key === 'Enter') k = 'enter';
    else if (e.key === 'Backspace' || e.key === 'Delete') k = 'back';
    else if (/^[a-zA-Z]$/.test(e.key)) k = e.key.toLowerCase();
    else if (e.key.startsWith('Arrow') || e.key === 'Tab' || e.key === ' ') k = e.key;
    if (k && handler(k, e) !== false) e.preventDefault();
  };
  addEventListener('keydown', fn);
  return () => removeEventListener('keydown', fn);
}
