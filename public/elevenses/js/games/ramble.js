// Ramble — trace themed words through a grid where every letter is used once.
import { h, dayData, wordSet, toast, statRow, streaks, puzzleNo, ICON, confetti, EASE, reduceMotion } from '../core.js';

const COLS = 6, ROWS = 7;
const PER_HINT = 3;
const S = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const adjacent = (a, b) => a !== b && Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) <= 1 && Math.abs((a % COLS) - (b % COLS)) <= 1;

export default {
  id: 'ramble',
  name: 'Ramble',
  short: 'Ramble',
  blurb: 'Trace the themed words through the grid.',
  tagline: 'Follow the hint, trace the words. Every letter in the grid belongs to one of today’s theme words.',
  color: 'var(--ramble)',
  tint: 'var(--ramble-tint)',
  perfectLabel: 'No hints used',
  perfect: (r) => r.win && !r.hintsUsed,

  async load(date) {
    const [p, words] = await Promise.all([dayData('ramble', date), wordSet('words.txt')]);
    return { ...p, dict: words };
  },
  summary(r, date) {
    if (!r) return 'A new trail to explore';
    if (r.done) return r.hintsUsed ? `Completed with ${r.hintsUsed} hint${r.hintsUsed > 1 ? 's' : ''}` : 'Completed — no hints!';
    return `${r.found.length} theme words found`;
  },
  statsSummary(records) {
    const all = Object.values(records).filter((r) => r.done);
    const s = streaks(records, (r) => r.win);
    return [[all.length, 'Completed'], [all.filter((r) => !r.hintsUsed).length, 'No-hint'], [s.current, 'Streak']];
  },
  stats(records) {
    const all = Object.values(records).filter((r) => r.done);
    const s = streaks(records, (r) => r.win);
    const hints = all.reduce((n, r) => n + (r.hintsUsed || 0), 0);
    return h(
      'div',
      null,
      statRow([[all.length, 'Completed'], [s.current, 'Current streak'], [s.max, 'Max streak']]),
      statRow([[all.filter((r) => !r.hintsUsed).length, 'No-hint solves'], [all.length ? (hints / all.length).toFixed(1) : '0', 'Hints per puzzle'], [all.reduce((n, r) => n + (r.bonus?.length || 0), 0), 'Bonus words']]),
    );
  },
  help() {
    return [
      h('p', null, 'Find the theme words hidden in the grid. The hint at the top tells you what you’re looking for.'),
      h('ul', null,
        h('li', null, 'Drag (or tap letter by letter) to trace a word through neighbouring letters — up, down, across or diagonally.'),
        h('li', null, 'Tap the last letter again, or lift your finger, to submit.'),
        h('li', null, 'Every letter belongs to exactly one theme word. No letter is left over.'),
        h('li', null, 'The boxes under the grid show how long each theme word is.')),
      h('p', null, h('b', null, 'Hints: '), `find ${PER_HINT} other words of four or more letters to earn a hint. A hint lights up where a theme word starts; use another on the same word to show its whole route.`),
    ];
  },

  mount(ctx) {
    const p = ctx.data; // {n, c, g, w:[words], p:[[cells]], dict}
    const r = ctx.rec || { found: [], bonus: [], hintsUsed: 0, hinted: {} };
    r.hinted ||= {};
    let path = [];
    let dragging = false;
    let moved = false;

    // ---- DOM
    const counter = h('span', { class: 'rb-count' });
    const themeCard = h('div', { class: 'rb-theme' }, h('span', { class: 'rb-label' }, 'Today’s ramble'), h('div', { class: 'rb-clue' }, p.c), counter);
    const current = h('div', { class: 'rb-current', 'aria-live': 'polite' });
    const svgEl = S('svg', { class: 'rb-lines', viewBox: `0 0 ${COLS * 10} ${ROWS * 10}`, preserveAspectRatio: 'none' });
    const foundLines = S('g');
    svgEl.append(foundLines);
    let selLine = null;
    let shownFound = -1;
    let fresh = -1; // the word just found, whose line fades in
    const cells = [];
    const gridEl = h('div', { class: 'rb-grid', role: 'grid', 'aria-label': 'Letter grid' },
      svgEl,
      p.g.split('').map((ch, i) => (cells[i] = h('div', { class: 'rb-cell', 'data-i': i, role: 'gridcell' }, h('span', null, ch)))));
    const hintBtn = h('button', { class: 'btn ghost rb-hint', onclick: useHint });
    const slots = h('div', { class: 'rb-slots' });
    const tools = h('div', { class: 'rb-tools' }, hintBtn);
    const wrap = h('div', { class: 'rb-wrap' }, themeCard, current, gridEl, tools, slots);
    ctx.root.append(wrap);

    // Size the letters from the space actually available (works the same in Safari, the Home
    // Screen app and embedded previews): as wide as the screen allows, keeping the Hint button in
    // view when there's room, and never smaller than 85% of full width just to fit it.
    function fit() {
      const body = ctx.root;
      if (!body.clientWidth) return;
      const wide = (wrap.clientWidth - 28 - 10) / 6;
      const top = gridEl.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      const room = body.clientHeight - top - 12;
      const withHint = (room - tools.offsetHeight - 8 - 12) / 7;
      const gridOnly = (room - 8) / 7;
      const size = Math.max(30, Math.min(70, wide, Math.max(withHint, Math.min(wide * 0.85, gridOnly))));
      gridEl.style.setProperty('--size', `${Math.floor(size * 10) / 10}px`);
    }
    const ro = new ResizeObserver(() => fit());
    ro.observe(ctx.root);
    requestAnimationFrame(fit);

    const center = (i) => [(i % COLS) * 10 + 5, Math.floor(i / COLS) * 10 + 5];
    function polyline(cellsList, cls) {
      const pts = cellsList.map((i) => center(i).join(',')).join(' ');
      return S('polyline', { points: pts, class: cls, 'vector-effect': 'non-scaling-stroke' });
    }
    function hintsEarned() {
      return Math.floor(r.bonus.length / PER_HINT);
    }
    function render() {
      const owner = new Map();
      r.found.forEach((wi) => p.p[wi].forEach((c) => owner.set(c, wi)));
      cells.forEach((el, i) => {
        el.classList.toggle('found', owner.has(i));
        el.classList.toggle('sel', path.includes(i));
        el.classList.remove('hint-start', 'hint-path');
      });
      for (const [wi, level] of Object.entries(r.hinted)) {
        if (r.found.includes(+wi)) continue;
        const cl = p.p[wi];
        cells[cl[0]].classList.add('hint-start');
        if (level >= 2) cl.forEach((c) => cells[c].classList.add('hint-path'));
      }
      // Found lines are only redrawn when a word is found, so the newest can fade in.
      if (shownFound !== r.found.length) {
        shownFound = r.found.length;
        foundLines.replaceChildren(...r.found.map((wi) => polyline(p.p[wi], wi === fresh ? 'found new' : 'found')));
        fresh = -1;
      }
      selLine?.remove();
      selLine = path.length > 1 ? polyline(path, 'sel') : null;
      if (selLine) svgEl.append(selLine);
      current.textContent = path.map((i) => p.g[i]).join('') || ' ';
      current.classList.toggle('empty', !path.length);
      counter.textContent = `${r.found.length} of ${p.w.length} theme words found`;
      const avail = hintsEarned() - r.hintsUsed;
      const progress = r.bonus.length % PER_HINT;
      hintBtn.innerHTML = `${ICON.bulb}<span>Hint</span><small>${avail > 0 ? `${avail} ready` : `${progress}/${PER_HINT}`}</small>`;
      hintBtn.classList.toggle('ready', avail > 0);
      hintBtn.disabled = r.done;
      slots.replaceChildren(
        ...p.w.map((w, wi) => {
          const got = r.found.includes(wi);
          const lvl = r.hinted[wi] || 0;
          return h('div', { class: `rb-slot ${got ? 'got' : ''}` }, w.split('').map((ch, k) => h('i', null, got || (lvl && k === 0) ? ch : '')));
        }),
      );
    }
    render();

    // ---- input
    function cellFromPoint(x, y, strict) {
      const el = document.elementFromPoint(x, y)?.closest?.('.rb-cell');
      if (!el) return -1;
      if (strict) {
        const b = el.getBoundingClientRect();
        const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
        if (Math.hypot(dx, dy) > b.width * 0.42) return -1;
      }
      return +el.dataset.i;
    }
    function extendTo(i) {
      if (i < 0) return;
      const last = path[path.length - 1];
      if (path.length >= 2 && i === path[path.length - 2]) {
        path.pop(); // backtrack
      } else if (!path.includes(i) && (last === undefined || adjacent(last, i))) {
        path.push(i);
      } else return;
      render();
    }
    gridEl.addEventListener('pointerdown', (e) => {
      if (r.done) return;
      const i = cellFromPoint(e.clientX, e.clientY, false);
      if (i < 0) return;
      e.preventDefault();
      gridEl.setPointerCapture?.(e.pointerId);
      dragging = true;
      moved = false;
      const last = path[path.length - 1];
      if (path.length && i === last) {
        // tap the last letter again to submit
        dragging = false;
        return submit();
      }
      if (path.length && (adjacent(last, i) || (path.length >= 2 && i === path[path.length - 2]))) extendTo(i);
      else {
        path = [i];
        render();
      }
    });
    gridEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const i = cellFromPoint(e.clientX, e.clientY, true);
      if (i >= 0 && i !== path[path.length - 1]) {
        moved = true;
        extendTo(i);
      }
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (moved && path.length > 1) submit();
    };
    gridEl.addEventListener('pointerup', end);
    gridEl.addEventListener('pointercancel', end);

    function flash(cls) {
      const els = path.map((i) => cells[i]);
      els.forEach((el) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); });
      current.classList.remove('shake');
      void current.offsetWidth;
      if (cls === 'nope') current.classList.add('shake');
    }
    // Letters of a found word turn colour one after another along its path, each with a little lift.
    function ripple(list) {
      const step = reduceMotion() ? 0 : 45;
      list.forEach((i, k) => {
        const sp = cells[i].firstChild;
        sp.style.transitionDelay = `${k * step}ms`;
        if (step && sp.animate) sp.animate([{ transform: 'none' }, { transform: 'scale(1.16)' }, { transform: 'none' }], { duration: 340, delay: k * step, easing: EASE });
      });
      setTimeout(() => list.forEach((i) => (cells[i].firstChild.style.transitionDelay = '')), list.length * step + 400);
    }
    function submit() {
      const word = path.map((i) => p.g[i]).join('');
      if (word.length < 3) { path = []; return render(); }
      const key = path.join(',');
      const wi = p.p.findIndex((cl) => cl.join(',') === key);
      const wordIdx = p.w.indexOf(word);
      if (wi >= 0 || (wordIdx >= 0 && !r.found.includes(wordIdx))) {
        const idx = wi >= 0 ? wi : wordIdx;
        if (r.found.includes(idx)) { toast('Already found'); path = []; return render(); }
        r.found.push(idx);
        fresh = idx;
        ripple(p.p[idx]);
        toast(['Lovely!', 'Spot on!', 'Nice find!', 'Cracking!', 'Splendid!'][r.found.length % 5]);
        path = [];
        if (r.found.length === p.w.length) {
          r.win = true;
          render();
          confetti(['#6F9A4A', '#E3B23C', '#2F7A8C', '#C8553D']);
          return ctx.finish(r, { headline: 'Trail complete!', sub: `Today’s theme: ${p.n}.`, shareText: shareText(), delay: 1000 });
        }
        ctx.save(r);
        return render();
      }
      if (word.length >= 4 && p.dict.has(word.toLowerCase())) {
        if (r.bonus.includes(word)) toast('Already found');
        else {
          r.bonus.push(word);
          const ready = r.bonus.length % PER_HINT === 0;
          toast(ready ? 'Hint earned!' : `Not a theme word — ${PER_HINT - (r.bonus.length % PER_HINT)} more for a hint`);
          ctx.save(r);
        }
      } else {
        flash('nope');
        toast(word.length < 4 ? 'Too short' : 'Not in our word list');
      }
      path = [];
      render();
    }
    function useHint() {
      if (hintsEarned() - r.hintsUsed <= 0) return toast(`Find ${PER_HINT - (r.bonus.length % PER_HINT)} more words to earn a hint`);
      // Prefer deepening an existing hint; else start a new word.
      const open = p.w.map((_, i) => i).filter((i) => !r.found.includes(i));
      if (!open.length) return;
      let target = open.find((i) => r.hinted[i] === 1);
      if (target === undefined) target = open.find((i) => !r.hinted[i]);
      if (target === undefined) return toast('You’ve had all the hints there are!');
      r.hinted[target] = (r.hinted[target] || 0) + 1;
      r.hintsUsed++;
      ctx.save(r);
      render();
    }
    function shareText() {
      return `Ramble No. ${puzzleNo(ctx.date)}\n“${p.c}”\n${r.found.map(() => '🟢').join('')}${r.hintsUsed ? ' ' + '💡'.repeat(r.hintsUsed) : ''}`;
    }
    if (r.done) themeCard.append(h('div', { class: 'rb-reveal' }, 'Theme: ', h('strong', null, p.n)));
    fit();
    return () => ro.disconnect();
  },
};
