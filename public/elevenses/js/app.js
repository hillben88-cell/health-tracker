// Elevenses — app shell: routing, home, archive, stats, settings.
import {
  h, svg, store, today, addDays, longDate, dayMonth, monthName, shortDate, puzzleNo, isPlayable, EPOCH, LAST,
  modal, closeModal, toast, share, countdownEl, ICON, iconBtn, flush,
} from './core.js';
import { GAME_ICONS, LOGO } from './icons.js';
import mini from './games/mini.js';
import midi from './games/midi.js';
import inkling from './games/inkling.js';
import spokes from './games/spokes.js';
import quartets from './games/quartets.js';
import ramble from './games/ramble.js';

export const GAMES = [mini, midi, inkling, spokes, quartets, ramble];
const byId = Object.fromEntries(GAMES.map((g) => [g.id, g]));
const app = document.getElementById('app');
let cleanup = null;

/* ---------------- Theme ---------------- */
function applyTheme() {
  const t = store.settings().theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#15171d' : '#fbf7f0');
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ---------------- Router ---------------- */
function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return parts;
}
export function go(path, replace = false) {
  const url = '#/' + path.replace(/^\//, '');
  if (replace || location.hash === url) {
    history.replaceState(null, '', url);
    route();
  } else location.hash = url;
}
addEventListener('hashchange', route);

function route() {
  closeModal();
  cleanup?.();
  cleanup = null;
  const [view, a, b] = parse();
  window.scrollTo(0, 0);
  document.body.dataset.view = view || 'home';
  if (view === 'play' && byId[a]) return playScreen(byId[a], b && isPlayable(b) ? b : today());
  if (view === 'archive') return archiveScreen(byId[a] ? a : GAMES[0].id, b);
  if (view === 'stats') return statsScreen();
  return homeScreen();
}

/* ---------------- Shared bits ---------------- */
function tabBar(active) {
  const tab = (id, label, icon, path) =>
    h('a', { class: `tab ${active === id ? 'on' : ''}`, href: '#/' + path, 'aria-current': active === id ? 'page' : null, html: ICON[icon] + `<span>${label}</span>` });
  return h('nav', { class: 'tabbar' }, tab('home', 'Today', 'home', ''), tab('archive', 'Archive', 'calendar', 'archive'), tab('stats', 'Stats', 'stats', 'stats'));
}
function greeting() {
  const hr = new Date().getHours();
  const m = new Date().getMinutes();
  if (hr === 10 && m >= 45) return 'Nearly elevenses — kettle on?';
  if (hr === 11 && m < 30) return 'It’s elevenses. Perfect timing.';
  if (hr < 5) return 'Burning the midnight oil?';
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}
const rec = (g, d) => store.get(g.id, d);

/* ---------------- Home ---------------- */
function homeScreen() {
  const d = today();
  const done = GAMES.filter((g) => rec(g, d)?.done || (g.id === 'spokes' && rec(g, d)?.found?.length)).length;
  const cards = GAMES.map((g) => {
    const r = rec(g, d);
    const status = g.summary(r, d);
    const finished = r?.done;
    return h(
      'a',
      { class: `card game-${g.id}`, href: `#/play/${g.id}/${d}`, style: { '--accent': g.color, '--tint': g.tint } },
      h('div', { class: 'card-icon', html: GAME_ICONS[g.id] }),
      h('div', { class: 'card-body' }, h('div', { class: 'card-name' }, g.name), h('div', { class: 'card-blurb' }, g.blurb), h('div', { class: `card-status ${finished ? 'done' : ''}` }, finished ? h('span', { class: 'tick', html: ICON.check }) : null, status)),
      h('div', { class: `card-cta ${finished ? 'ghost' : ''}` }, finished ? 'View' : r ? 'Resume' : 'Play'),
    );
  });
  app.replaceChildren(
    h(
      'div',
      { class: 'screen home' },
      h(
        'header',
        { class: 'home-head' },
        h('div', { class: 'brand' }, h('span', { class: 'logo', html: LOGO }), h('span', { class: 'wordmark' }, 'Elevenses')),
        iconBtn('gear', 'Settings', settingsModal),
      ),
      h(
        'section',
        { class: 'hero' },
        h('p', { class: 'hero-greet' }, greeting()),
        h('h1', { class: 'hero-date' }, dayMonth(d)),
        h('div', { class: 'hero-progress' }, h('div', { class: 'pips' }, GAMES.map((g) => h('i', { class: rec(g, d)?.done ? 'on' : rec(g, d) ? 'half' : '', style: { '--accent': g.color } }))), h('span', null, done === GAMES.length ? 'All done for today — lovely work.' : `${done} of ${GAMES.length} played today`)),
      ),
      h('section', { class: 'cards' }, cards),
      h('p', { class: 'home-foot' }, 'New puzzles every day at midnight. Puzzle No. ', puzzleNo(d), '.'),
    ),
    tabBar('home'),
  );
}

/* ---------------- Play ---------------- */
function splash(g, date, onPlay) {
  const r = rec(g, date);
  return h(
    'div',
    { class: `splash game-${g.id}`, style: { '--accent': g.color, '--tint': g.tint } },
    h('button', { class: 'icon-btn splash-back', 'aria-label': 'Back', onclick: () => history.length > 1 ? history.back() : go(''), html: ICON.back }),
    h(
      'div',
      { class: 'splash-inner' },
      h('div', { class: 'splash-icon', html: GAME_ICONS[g.id] }),
      h('h1', { class: 'splash-name' }, g.name),
      h('p', { class: 'splash-blurb' }, g.tagline || g.blurb),
      h('button', { class: 'btn primary big', onclick: onPlay }, r ? 'Continue' : 'Play'),
      h('button', { class: 'btn ghost', onclick: () => helpModal(g) }, 'How to play'),
      h('div', { class: 'splash-meta' }, h('strong', null, longDate(date)), h('span', null, `No. ${puzzleNo(date)}`), date !== today() ? h('span', { class: 'chip' }, 'From the archive') : null),
    ),
  );
}

function helpModal(g) {
  modal(h('div', { class: 'help' }, g.help()), { title: `How to play ${g.name}`, cls: 'tall' });
}

function statsModal(g) {
  const records = store.all(g.id);
  modal(h('div', { class: 'stats-body' }, g.stats(records)), { title: `${g.name} statistics` });
}

/** Called by games when a puzzle ends. */
function resultModal(g, date, { headline, sub, shareText, extra }) {
  const isToday = date === today();
  const body = h(
    'div',
    { class: 'result' },
    h('div', { class: 'result-icon', html: GAME_ICONS[g.id], style: { '--accent': g.color, '--tint': g.tint } }),
    h('h2', { class: 'result-head' }, headline),
    sub ? h('p', { class: 'result-sub' }, sub) : null,
    extra || null,
    h('div', { class: 'stats-body' }, g.stats(store.all(g.id), date)),
    h(
      'div',
      { class: 'result-actions' },
      shareText ? h('button', { class: 'btn primary', onclick: () => share(shareText), html: ICON.share + '<span>Share</span>' }) : null,
      h('a', { class: 'btn ghost', href: `#/archive/${g.id}` }, 'Play the archive'),
    ),
    isToday ? h('p', { class: 'result-next' }, 'Next puzzle in ', countdownEl()) : null,
  );
  modal(body, { cls: 'result-sheet' });
}

async function playScreen(g, date) {
  const body = h('main', { class: 'game-body' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Brewing your puzzle…'));
  const title = h('div', { class: 'gh-title' }, h('strong', null, g.name), h('span', null, date === today() ? shortDate(date) : `${shortDate(date)} · No. ${puzzleNo(date)}`));
  const extraSlot = h('div', { class: 'gh-extra' });
  const header = h(
    'header',
    { class: 'game-head' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => go(date === today() ? '' : `archive/${g.id}/${date.slice(0, 7)}`), html: ICON.back }),
    title,
    extraSlot,
    iconBtn('help', 'How to play', () => helpModal(g)),
    iconBtn('stats', 'Statistics', () => statsModal(g)),
    iconBtn('gear', 'Settings', settingsModal),
  );
  const screen = h('div', { class: `screen play game-${g.id}`, style: { '--accent': g.color, '--tint': g.tint } }, header, body);
  let alive = true;
  let unmount = null;
  cleanup = () => {
    alive = false;
    unmount?.();
    flush();
  };

  const start = async () => {
    let data;
    try {
      data = await g.load(date);
    } catch (e) {
      body.replaceChildren(h('div', { class: 'loading err' }, 'Couldn’t load this puzzle. ', h('br'), String(e.message || e), h('br'), h('button', { class: 'btn ghost', onclick: start }, 'Try again')));
      return;
    }
    if (!alive) return;
    body.replaceChildren();
    const ctx = {
      root: body,
      date,
      data,
      isToday: date === today(),
      rec: rec(g, date) || null,
      extraSlot,
      alive: () => alive,
      save(r) {
        ctx.rec = r;
        store.set(g.id, date, r);
      },
      finish(r, result) {
        r.done = true;
        r.onDay = today() === date;
        r.finishedAt = Date.now();
        ctx.save(r);
        if (result) setTimeout(() => alive && resultModal(g, date, result), result.delay ?? 900);
      },
      showResult: (result) => resultModal(g, date, result),
      settings: store.settings(),
    };
    unmount = g.mount(ctx);
    let seen = true;
    try {
      seen = !!localStorage.getItem('elevenses.seen.' + g.id);
      if (!seen) localStorage.setItem('elevenses.seen.' + g.id, '1');
    } catch {}
    if (!seen) helpModal(g);
  };

  if (!rec(g, date)) {
    app.replaceChildren(
      splash(g, date, () => {
        app.replaceChildren(screen);
        start();
      }),
    );
  } else {
    app.replaceChildren(screen);
    start();
  }
}

/* ---------------- Archive ---------------- */
function archiveScreen(gameId, month) {
  const g = byId[gameId];
  const t = today();
  const firstMonth = EPOCH.slice(0, 7);
  const lastMonth = (t < LAST ? t : LAST).slice(0, 7);
  let m = month && month >= firstMonth && month <= lastMonth ? month : lastMonth;
  const records = store.all(g.id);

  const chips = h(
    'div',
    { class: 'chips', role: 'tablist' },
    GAMES.map((x) => h('a', { class: `chip-btn ${x.id === g.id ? 'on' : ''}`, href: `#/archive/${x.id}/${m}`, style: { '--accent': x.color }, role: 'tab', 'aria-selected': x.id === g.id ? 'true' : 'false' }, h('span', { class: 'chip-ico', html: GAME_ICONS[x.id] }), x.short || x.name)),
  );
  const cal = h('div', { class: 'cal' });
  const title = h('h2', { class: 'cal-title' });
  const prev = iconBtn('chevL', 'Previous month', () => setMonth(-1));
  const next = iconBtn('chevR', 'Next month', () => setMonth(1));

  function setMonth(delta) {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
    if (d < firstMonth || d > lastMonth) return;
    m = d;
    history.replaceState(null, '', `#/archive/${g.id}/${m}`);
    draw();
  }
  function draw() {
    title.textContent = monthName(m + '-01');
    prev.disabled = m <= firstMonth;
    next.disabled = m >= lastMonth;
    const first = m + '-01';
    const dow = (new Date(Date.parse(first + 'T00:00:00Z')).getUTCDay() + 6) % 7; // Monday first
    const cells = [];
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => cells.push(h('div', { class: 'cal-dow' }, d)));
    for (let i = 0; i < dow; i++) cells.push(h('div', { class: 'cal-blank' }));
    for (let day = first; day.slice(0, 7) === m; day = addDays(day, 1)) {
      const r = records[day];
      const playable = isPlayable(day);
      const state = !r ? '' : r.done ? (r.win === false ? 'lost' : 'won') : 'started';
      const star = r?.done && g.perfect?.(r);
      cells.push(
        playable
          ? h(
              'a',
              { class: `cal-day ${state} ${day === t ? 'today' : ''}`, href: `#/play/${g.id}/${day}`, 'aria-label': `${longDate(day)}${state ? ', ' + state : ''}` },
              h('span', { class: 'cal-num' }, Number(day.slice(8))),
              star ? h('span', { class: 'cal-star' }, '★') : null,
            )
          : h('div', { class: 'cal-day off' }, h('span', { class: 'cal-num' }, Number(day.slice(8)))),
      );
    }
    cal.replaceChildren(...cells);
  }
  draw();
  const total = Object.values(records).filter((r) => r.done).length;
  const avail = Math.min(puzzleNo(t), puzzleNo(LAST));
  app.replaceChildren(
    h(
      'div',
      { class: 'screen archive', style: { '--accent': g.color, '--tint': g.tint } },
      h('header', { class: 'page-head' }, h('h1', null, 'Archive'), h('p', null, 'Every puzzle since 1 September 2026.')),
      chips,
      h('div', { class: 'cal-card' }, h('div', { class: 'cal-nav' }, prev, title, next), cal, h('div', { class: 'cal-legend' }, h('span', null, h('i', { class: 'lg won' }), 'Solved'), h('span', null, h('i', { class: 'lg started' }), 'In progress'), h('span', null, h('i', { class: 'lg lost' }), 'Not solved'), g.perfect ? h('span', null, '★ ', g.perfectLabel) : null)),
      h('p', { class: 'archive-sum' }, `You’ve finished ${total} of ${avail} ${g.name} puzzles.`),
      h('button', { class: 'btn ghost', onclick: () => { const unplayed = []; for (let d = EPOCH; d <= t && d <= LAST; d = addDays(d, 1)) if (!records[d]?.done) unplayed.push(d); if (!unplayed.length) return toast('You’ve played them all!'); go(`play/${g.id}/${unplayed[Math.floor(Math.random() * unplayed.length)]}`); } }, 'Surprise me with an unplayed puzzle'),
    ),
    tabBar('archive'),
  );
}

/* ---------------- Stats ---------------- */
function statsScreen() {
  app.replaceChildren(
    h(
      'div',
      { class: 'screen stats-screen' },
      h('header', { class: 'page-head' }, h('h1', null, 'Stats'), h('p', null, 'Streaks count puzzles finished on their own day.')),
      GAMES.map((g) =>
        h(
          'button',
          { class: 'stat-card', style: { '--accent': g.color, '--tint': g.tint }, onclick: () => statsModal(g) },
          h('div', { class: 'stat-card-head' }, h('span', { class: 'card-icon sm', html: GAME_ICONS[g.id] }), h('strong', null, g.name), h('span', { class: 'more', html: ICON.chevR })),
          h('div', { class: 'mini-stats' }, g.statsSummary(store.all(g.id)).map(([v, l]) => h('div', null, h('b', null, v), h('span', null, l)))),
        ),
      ),
    ),
    tabBar('stats'),
  );
}

/* ---------------- Settings ---------------- */
function settingsModal() {
  const s = store.settings();
  const seg = (key, opts) =>
    h(
      'div',
      { class: 'seg' },
      opts.map(([v, label]) =>
        h('button', { class: s[key] === v ? 'on' : '', onclick: (e) => { store.setSetting(key, v); [...e.target.parentNode.children].forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); if (key === 'theme') applyTheme(); } }, label),
      ),
    );
  const toggle = (key, label, desc) => {
    const input = h('input', { type: 'checkbox', role: 'switch', checked: !!s[key] || null, onchange: (e) => store.setSetting(key, e.target.checked) });
    return h('label', { class: 'setting toggle' }, h('div', null, h('strong', null, label), desc ? h('small', null, desc) : null), input);
  };
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', style: { display: 'none' },
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        store.importJSON(await f.text());
        toast('Progress restored');
        closeModal();
        route();
      } catch (err) {
        toast(err.message || 'Import failed');
      }
    },
  });
  modal(
    h(
      'div',
      { class: 'settings' },
      h('div', { class: 'setting' }, h('strong', null, 'Appearance'), seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])),
      toggle('inklingHard', 'Inkling hard mode', 'Any revealed hints must be used in later guesses.'),
      toggle('showTimer', 'Show crossword timer', 'The clock still runs in the background for your stats.'),
      toggle('autocheck', 'Crossword autocheck', 'Wrong letters are flagged as you type (counts as a check).'),
      h(
        'div',
        { class: 'setting' },
        h('div', null, h('strong', null, 'Back up your progress'), h('small', null, 'Your stats live on this device. Save a backup file now and then, especially before changing phone.')),
        h(
          'div',
          { class: 'row-btns' },
          h('button', { class: 'btn ghost sm', onclick: () => { const blob = new Blob([store.exportJSON()], { type: 'application/json' }); const file = new File([blob], `elevenses-backup-${today()}.json`, { type: 'application/json' }); if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch(() => {}); else { const a = h('a', { href: URL.createObjectURL(blob), download: file.name }); a.click(); } } }, 'Export'),
          h('button', { class: 'btn ghost sm', onclick: () => fileInput.click() }, 'Import'),
          fileInput,
        ),
      ),
      h('details', { class: 'setting about' }, h('summary', null, h('strong', null, 'Add Elevenses to your Home Screen')), h('ol', null, h('li', null, 'Open this page in Safari.'), h('li', null, 'Tap the Share button.'), h('li', null, 'Choose “Add to Home Screen”, then “Add”.'), h('li', null, 'Open Elevenses from its icon — it runs full-screen and works offline.'))),
      h('details', { class: 'setting about' }, h('summary', null, h('strong', null, 'About')), h('p', null, 'Elevenses is a small daily puzzle collection made in Britain: two crosswords, a word-guessing game, a word wheel, a grouping puzzle and a themed word search. Puzzles are generated from original British clue and category banks. Word lists derive from SCOWL (© Kevin Atkinson) and are used under its permissive licence.')),
      h('button', { class: 'btn danger sm', onclick: () => { if (confirm('Delete all your Elevenses progress and stats on this device?')) { store.reset(); toast('Progress reset'); closeModal(); route(); } } }, 'Reset all progress'),
    ),
    { title: 'Settings' },
  );
}

/* ---------------- Boot ---------------- */
route();
// Refresh the home screen when the day ticks over while the app is open.
let lastDay = today();
setInterval(() => {
  if (today() !== lastDay) {
    lastDay = today();
    if (!parse()[0]) route();
  }
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && today() !== lastDay) {
    lastDay = today();
    if (!parse()[0]) route();
  }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
export { go as navigate };
