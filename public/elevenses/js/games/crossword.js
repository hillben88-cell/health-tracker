// Shared crossword engine for the Mini (5x5) and the Midi (9x9 British-style).
import { h, dayData, fetchJSON, hash, keyboard, onPhysicalKeys, toast, statRow, streaks, puzzleNo, fmtClock, ICON, modal, closeModal, confetti } from '../core.js';

/** Derive numbered entries from a flat grid string. */
export function buildEntries(grid, size) {
  const white = (r, c) => r >= 0 && c >= 0 && r < size && c < size && grid[r * size + c] !== '#';
  const entries = [];
  const numbers = new Array(size * size).fill(0);
  let n = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (!white(r, c)) continue;
      const startA = !white(r, c - 1) && white(r, c + 1);
      const startD = !white(r - 1, c) && white(r + 1, c);
      if (!startA && !startD) continue;
      numbers[r * size + c] = ++n;
      if (startA) {
        const cells = [];
        for (let cc = c; white(r, cc); cc++) cells.push(r * size + cc);
        entries.push({ num: n, dir: 'A', cells });
      }
      if (startD) {
        const cells = [];
        for (let rr = r; white(rr, c); rr++) cells.push(rr * size + c);
        entries.push({ num: n, dir: 'D', cells });
      }
    }
  entries.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'A' ? -1 : 1));
  entries.forEach((e) => (e.answer = e.cells.map((i) => grid[i]).join('')));
  return { entries, numbers };
}

export function createCrossword({ id, name, size, blurb, tagline, color, tint, style }) {
  const statsOf = (records) => {
    const solved = Object.values(records).filter((r) => r.done && r.win);
    const clean = solved.filter((r) => !r.revealed);
    const times = clean.map((r) => r.elapsed);
    const s = streaks(records, (r) => r.win && !r.revealed);
    return { solved, clean, times, s };
  };
  return {
    id, name, blurb, tagline, color, tint,
    short: name.replace(' Crossword', ''),
    perfectLabel: 'Solved without help',
    perfect: (r) => r.win && !r.revealed && !r.checked,

    async load(date) {
      // The Mini uses its own, trickier clues where it has one, and the plain bank otherwise.
      const [grid, clues, tricky] = await Promise.all([
        dayData(id, date),
        fetchJSON('data/clues.json'),
        id === 'mini' ? fetchJSON('data/clues-mini.json').catch(() => ({})) : {},
      ]);
      const { entries, numbers } = buildEntries(grid, size);
      for (const e of entries) {
        const list = tricky[e.answer] || clues[e.answer] || ['(clue missing)'];
        e.clue = list[hash(date + e.answer) % list.length];
      }
      return { grid, entries, numbers };
    },
    summary(r) {
      if (!r) return 'Fresh grid, sharpen your pencil';
      if (r.done) return `Solved in ${fmtClock(r.elapsed)}${r.revealed ? ' (with help)' : ''}`;
      return `In progress · ${fmtClock(r.elapsed || 0)}`;
    },
    statsSummary(records) {
      const { solved, times, s } = statsOf(records);
      return [[solved.length, 'Solved'], [times.length ? fmtClock(Math.min(...times)) : '–', 'Best'], [s.current, 'Streak']];
    },
    stats(records, date) {
      const { solved, clean, times, s } = statsOf(records);
      const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const t = date && records[date];
      return h(
        'div',
        null,
        statRow([[solved.length, 'Solved'], [s.current, 'Current streak'], [s.max, 'Max streak']]),
        statRow([[times.length ? fmtClock(Math.min(...times)) : '–', 'Best time'], [times.length ? fmtClock(avg) : '–', 'Average time'], [clean.length, 'Solved unaided']]),
        t?.win ? h('p', { class: 'fine' }, `Today: ${fmtClock(t.elapsed)}${t.revealed ? ' with reveals — streaks need a solve without reveals.' : ''}`) : null,
      );
    },
    help() {
      return [
        h('p', null, style === 'british'
          ? 'A British-style crossword: not every letter is crossed by another word, so read the clues carefully. The number in brackets tells you how many letters the answer has.'
          : 'A bite-size crossword. Fill the grid using the clues — the number in brackets shows the answer’s length.'),
        h('ul', null,
          h('li', null, 'Tap a square to select it. Tap it again to switch between Across and Down.'),
          h('li', null, 'Tap the clue bar to switch direction, or use the arrows to hop between clues.'),
          h('li', null, 'Stuck? ', h('b', null, 'Check'), ' marks wrong letters; ', h('b', null, 'Reveal'), ' fills them in — but reveals don’t count towards your streak.')),
        h('p', null, 'The clock starts when you open the puzzle and pauses whenever you leave.'),
      ];
    },
    mount(ctx) {
      return mountCrossword(ctx, { id, name, size, style });
    },
  };
}

function mountCrossword(ctx, { id, name, size, style }) {
  const { grid, entries, numbers } = ctx.data;
  const N = size * size;
  const r = ctx.rec || { fill: Array(N).fill(''), elapsed: 0, revealedCells: [] };
  r.fill ||= Array(N).fill('');
  r.revealedCells ||= [];
  const wrong = new Set();
  const cellEntry = Array.from({ length: N }, () => ({}));
  entries.forEach((e, ei) => e.cells.forEach((c) => (cellEntry[c][e.dir] = ei)));
  const firstCell = entries[0].cells[0];
  let sel = { cell: firstCell, dir: entries[0].dir };
  let paused = false;
  let warnedFull = '';

  // ---- DOM
  const clock = h('button', { class: 'xw-clock', onclick: pause, 'aria-label': 'Pause' });
  const menu = (label, icon, items, note) => {
    const pop = h('div', { class: 'xw-pop', hidden: true, role: 'menu' }, items.map(([t, fn]) => h('button', { role: 'menuitem', onclick: () => { pop.hidden = true; fn(); } }, t)), note ? h('p', { class: 'xw-pop-note' }, note) : null);
    const btn = h('button', { class: 'xw-tool pill', 'aria-haspopup': 'menu', onclick: (e) => { e.stopPropagation(); document.querySelectorAll('.xw-pop').forEach((p) => p !== pop && (p.hidden = true)); pop.hidden = !pop.hidden; }, html: `${ICON[icon]}<span>${label}</span>${ICON.caret}` });
    return h('div', { class: 'xw-menu' }, btn, pop);
  };
  const toolbar = h(
    'div',
    { class: 'xw-toolbar' },
    clock,
    h('div', { class: 'xw-tools' },
      h('button', { class: 'xw-tool pill', onclick: showClues, html: ICON.list + '<span>Clues</span>' }),
      menu('Check', 'check', [['Check this square', () => check('cell')], ['Check this word', () => check('word')], ['Check the whole puzzle', () => check('all')]], 'Wrong letters get a red line through them.'),
      menu('Reveal', 'eye', [['Reveal this square', () => reveal('cell')], ['Reveal this word', () => reveal('word')], ['Reveal the whole puzzle', () => reveal('all')]], 'Reveals don’t count towards your streak.')),
  );
  document.addEventListener('click', closePops);
  function closePops() { document.querySelectorAll('.xw-pop').forEach((p) => (p.hidden = true)); }

  const cellEls = [];
  const gridEl = h(
    'div',
    { class: `xw-grid size-${size}`, style: { '--n': size }, role: 'grid', 'aria-label': `${name} grid` },
    Array.from({ length: N }, (_, i) => {
      if (grid[i] === '#') return (cellEls[i] = h('div', { class: 'xw-cell block', 'aria-hidden': 'true' }));
      return (cellEls[i] = h('div', { class: 'xw-cell', 'data-i': i, role: 'gridcell' }, numbers[i] ? h('span', { class: 'xw-num' }, numbers[i]) : null, h('span', { class: 'xw-letter' })));
    }),
  );
  const overlay = h('div', { class: 'xw-paused', hidden: true, onclick: resume }, h('div', null, h('strong', null, 'Paused'), h('span', null, 'Tap to carry on')));
  const gridWrap = h('div', { class: 'xw-gridwrap' }, gridEl, overlay);
  gridEl.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.xw-cell:not(.block)');
    if (!el) return;
    e.preventDefault();
    tapCell(+el.dataset.i);
  });
  const clueNum = h('span', { class: 'xw-cnum' });
  const clueText = h('span', { class: 'xw-ctext' });
  const clueBar = h(
    'div',
    { class: 'xw-cluebar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous clue', onclick: () => jump(-1), html: ICON.chevL }),
    h('button', { class: 'xw-clue', onclick: toggleDir }, clueNum, clueText),
    h('button', { class: 'icon-btn', 'aria-label': 'Next clue', onclick: () => jump(1), html: ICON.chevR }),
  );
  const kb = keyboard(onKey, { enter: false });
  const done = h('div', { class: 'xw-done', hidden: true });
  // Shown when every square is filled but something's wrong.
  const nudgeBar = h('div', { class: 'xw-nudge', hidden: true }, h('span', null, 'Not quite right yet.'), h('button', { class: 'btn primary sm', onclick: () => check('all') }, 'Check my answers'));
  ctx.root.append(h('div', { class: `xw-wrap ${style}` }, toolbar, gridWrap, done, nudgeBar, clueBar), kb.el);
  if (!ctx.settings.showTimer) clock.classList.add('hide-time');
  // Size the grid to whatever space is left between the toolbar, clue bar and keyboard.
  const wrapEl = ctx.root.querySelector('.xw-wrap');
  const fit = () => {
    const free = wrapEl.clientHeight - toolbar.offsetHeight - clueBar.offsetHeight - (done.hidden ? 0 : done.offsetHeight + 8) - (nudgeBar.hidden ? 0 : nudgeBar.offsetHeight + 8) - 36;
    const side = Math.max(220, Math.min(wrapEl.clientWidth - 20, 460, free));
    gridWrap.style.setProperty('--gs', side + 'px');
  };
  const ro = new ResizeObserver(fit);
  ro.observe(wrapEl);
  fit();

  // ---- helpers
  const entryOf = (cell = sel.cell, dir = sel.dir) => {
    const ei = cellEntry[cell][dir];
    return ei === undefined ? null : entries[ei];
  };
  function fixDir() {
    if (cellEntry[sel.cell][sel.dir] === undefined) sel.dir = sel.dir === 'A' ? 'D' : 'A';
  }
  function render() {
    const e = entryOf();
    const inWord = new Set(e ? e.cells : []);
    for (let i = 0; i < N; i++) {
      const el = cellEls[i];
      if (grid[i] === '#') continue;
      el.classList.toggle('sel', i === sel.cell && !r.done);
      el.classList.toggle('word', inWord.has(i) && i !== sel.cell && !r.done);
      el.classList.toggle('wrong', wrong.has(i));
      el.classList.toggle('revealed', r.revealedCells.includes(i));
      el.querySelector('.xw-letter').textContent = (r.fill[i] || '').toUpperCase();
    }
    if (e) {
      clueNum.textContent = `${e.num}${e.dir === 'A' ? 'A' : 'D'}`;
      clueText.textContent = `${e.clue} (${e.cells.length})`;
    }
    clock.innerHTML = r.done ? `${ICON.check}<span>${fmtClock(r.elapsed)}</span>` : `<span>${fmtClock(r.elapsed)}</span>${ICON.pause}`;
  }
  function tapCell(i) {
    if (r.done) return;
    if (i === sel.cell) toggleDir();
    else {
      sel.cell = i;
      fixDir();
    }
    render();
  }
  function toggleDir() {
    const other = sel.dir === 'A' ? 'D' : 'A';
    if (cellEntry[sel.cell][other] !== undefined) sel.dir = other;
    render();
  }
  function jump(delta) {
    const ei = cellEntry[sel.cell][sel.dir];
    const next = entries[(ei + delta + entries.length) % entries.length];
    sel = { cell: next.cells.find((c) => !r.fill[c]) ?? next.cells[0], dir: next.dir };
    render();
  }
  function advance() {
    const e = entryOf();
    const k = e.cells.indexOf(sel.cell);
    const after = e.cells.slice(k + 1).find((c) => !r.fill[c]);
    if (after !== undefined) return (sel.cell = after);
    if (e.cells.some((c) => !r.fill[c])) {
      // gaps earlier in this word
      if (k < e.cells.length - 1) return (sel.cell = e.cells[k + 1]);
      return;
    }
    // word complete: go to the next word with a gap
    const ei = entries.indexOf(e);
    for (let d = 1; d <= entries.length; d++) {
      const n = entries[(ei + d) % entries.length];
      const gap = n.cells.find((c) => !r.fill[c]);
      if (gap !== undefined) return (sel = { cell: gap, dir: n.dir });
    }
    if (k < e.cells.length - 1) sel.cell = e.cells[k + 1];
  }
  function move(dr, dc) {
    let rr = Math.floor(sel.cell / size), cc = sel.cell % size;
    for (;;) {
      rr += dr;
      cc += dc;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) return;
      if (grid[rr * size + cc] !== '#') break;
    }
    sel.cell = rr * size + cc;
    fixDir();
  }
  function onKey(k, ev) {
    if (r.done) return false;
    if (paused) resume();
    if (/^[a-z]$/.test(k)) {
      if (r.revealedCells.includes(sel.cell)) { advance(); return render(); }
      r.fill[sel.cell] = k;
      wrong.delete(sel.cell);
      if (ctx.settings.autocheck && k !== grid[sel.cell]) { wrong.add(sel.cell); r.checked = true; }
      advance();
    } else if (k === 'back') {
      if (r.fill[sel.cell] && !r.revealedCells.includes(sel.cell)) r.fill[sel.cell] = '';
      else {
        const e = entryOf();
        const idx = e.cells.indexOf(sel.cell);
        if (idx > 0) {
          sel.cell = e.cells[idx - 1];
          if (!r.revealedCells.includes(sel.cell)) r.fill[sel.cell] = '';
        }
      }
      wrong.delete(sel.cell);
    } else if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
      const want = k === 'ArrowRight' || k === 'ArrowLeft' ? 'A' : 'D';
      if (sel.dir !== want && cellEntry[sel.cell][want] !== undefined) sel.dir = want;
      else move(k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0, k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0);
    } else if (k === 'Tab' || k === 'enter') jump(ev?.shiftKey ? -1 : 1);
    else if (k === ' ') toggleDir();
    else return false;
    ctx.save(r);
    render();
    checkComplete();
  }
  function cellsFor(scope) {
    if (scope === 'cell') return [sel.cell];
    if (scope === 'word') return entryOf().cells;
    return [...Array(N).keys()].filter((i) => grid[i] !== '#');
  }
  function check(scope) {
    let bad = 0, empty = 0;
    for (const c of cellsFor(scope)) {
      if (!r.fill[c]) empty++;
      else if (r.fill[c] !== grid[c]) { wrong.add(c); bad++; }
    }
    r.checked = true;
    ctx.save(r);
    render();
    const what = scope === 'cell' ? 'That square' : scope === 'word' ? 'That word' : 'Everything you’ve filled in';
    toast(bad ? `${bad} square${bad > 1 ? 's' : ''} not right, marked in red` : empty ? `${what} is right so far` : `${what} is right`);
  }
  function reveal(scope) {
    for (const c of cellsFor(scope)) {
      if (r.fill[c] !== grid[c]) {
        r.fill[c] = grid[c];
        if (!r.revealedCells.includes(c)) r.revealedCells.push(c);
      }
      wrong.delete(c);
    }
    r.revealed = r.revealedCells.length > 0;
    ctx.save(r);
    render();
    checkComplete();
  }
  function showNudge(on) {
    if (nudgeBar.hidden === !on) return;
    nudgeBar.hidden = !on;
    requestAnimationFrame(fit);
  }
  function checkComplete() {
    if (r.done) return showNudge(false);
    const cellsAll = cellsFor('all');
    if (cellsAll.some((c) => !r.fill[c])) return showNudge(false);
    if (cellsAll.every((c) => r.fill[c] === grid[c])) {
      showNudge(false);
      r.win = true;
      stopTimer();
      render();
      showDone();
      cellsAll.forEach((c, k) => setTimeout(() => cellEls[c].classList.add('wave'), (Math.floor(c / size) + (c % size)) * 60));
      if (!r.revealed) confetti();
      ctx.finish(r, {
        headline: r.revealed ? 'Finished!' : ['Lightning!', 'Splendid!', 'Well done!'][r.elapsed < 60 ? 0 : r.elapsed < 300 ? 1 : 2],
        sub: `You solved ${name} No. ${puzzleNo(ctx.date)} in ${fmtClock(r.elapsed)}${r.revealed ? ' (with a little help)' : ''}.`,
        shareText: `Elevenses ${name} No. ${puzzleNo(ctx.date)}\nSolved in ${fmtClock(r.elapsed)}${r.revealed ? ' (with reveals)' : ''} ✏️`,
        delay: 1300,
      });
    } else {
      const key = r.fill.join('');
      if (key !== warnedFull) {
        warnedFull = key;
        toast('Every square is filled, but something’s not right', { ms: 2200 });
      }
      showNudge(true);
    }
  }
  function showDone() {
    done.hidden = false;
    kb.el.hidden = true;
    requestAnimationFrame(fit);
    done.replaceChildren(h('span', { html: ICON.check }), `Solved in ${fmtClock(r.elapsed)}`, h('button', { class: 'linkish', onclick: showClues }, 'Review clues'));
  }
  function showClues() {
    closePops();
    const list = (dir, title) =>
      h('div', { class: 'xw-list' }, h('h3', null, title),
        h('ol', null, entries.filter((e) => e.dir === dir).map((e) =>
          h('li', { class: entryOf() === e ? 'on' : '', onclick: () => { sel = { cell: e.cells.find((c) => !r.fill[c]) ?? e.cells[0], dir: e.dir }; closeModal(); render(); } },
            h('b', null, e.num), h('span', null, `${e.clue} (${e.cells.length})`, r.done ? h('em', null, ' — ' + e.answer.toUpperCase()) : null)))));
    modal(h('div', { class: 'xw-lists' }, list('A', 'Across'), list('D', 'Down')), { title: 'Clues', cls: 'tall' });
  }

  // ---- timer
  let timer = null;
  let lastTick = 0;
  function tick() {
    const now = performance.now();
    r.elapsed += (now - lastTick) / 1000;
    lastTick = now;
    if (Math.floor(r.elapsed) % 5 === 0) ctx.save(r);
    render();
  }
  function startTimer() {
    if (r.done || timer || paused) return;
    lastTick = performance.now();
    timer = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    r.elapsed += (performance.now() - lastTick) / 1000;
    r.elapsed = Math.round(r.elapsed);
    ctx.save(r);
  }
  function pause() {
    if (r.done) return;
    paused = true;
    stopTimer();
    overlay.hidden = false;
    render();
  }
  function resume() {
    paused = false;
    overlay.hidden = true;
    startTimer();
  }
  const vis = () => (document.hidden ? stopTimer() : startTimer());
  document.addEventListener('visibilitychange', vis);

  fixDir();
  if (r.done) showDone();
  else if (cellsFor('all').every((c) => r.fill[c])) showNudge(true);
  render();
  startTimer();
  if (!r.done && ctx.rec && ctx.rec.elapsed > 0) {
    // resuming: jump to first gap
    const gapEntry = entries.find((e) => e.cells.some((c) => !r.fill[c]));
    if (gapEntry) sel = { cell: gapEntry.cells.find((c) => !r.fill[c]), dir: gapEntry.dir };
    render();
  }
  const off = onPhysicalKeys(onKey, ctx.alive);
  return () => {
    stopTimer();
    off();
    ro.disconnect();
    document.removeEventListener('visibilitychange', vis);
    document.removeEventListener('click', closePops);
  };
}
