// Spokes — make words from the wheel. Every word uses the hub letter; each tile once.
import { h, dayData, toast, statRow, streaks, puzzleNo, onPhysicalKeys, ICON, today, confetti, modal, closeModal } from '../core.js';

const RANKS = [
  ['Stabilisers', 0],
  ['Pootling', 0.02],
  ['Freewheeling', 0.06],
  ['Club Run', 0.12],
  ['Peloton', 0.2],
  ['Breakaway', 0.3],
  ['Polka Dot', 0.4],
  ['Yellow Jersey', 0.5],
];
const TOP = 'Hors Catégorie';
export const points = (w) => (w.length === 9 ? 10 : w.length - 3);
const PRAISE = ['', 'Good!', 'Nice!', 'Great!', 'Superb!', 'Magnificent!', 'Magnificent!'];
const S = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};

function rankOf(score, max) {
  if (max && score >= max) return { name: TOP, index: RANKS.length };
  let idx = 0;
  RANKS.forEach(([, f], i) => score >= Math.ceil(f * max) && (idx = i));
  return { name: RANKS[idx][0], index: idx };
}
const maxScore = (words) => words.reduce((s, w) => s + points(w), 0);

export default {
  id: 'spokes',
  name: 'Spokes',
  short: 'Spokes',
  blurb: 'How many words can you make from the wheel?',
  tagline: 'Spin up words from nine letters — every one must use the hub. Can you find the Nine?',
  color: 'var(--spokes)',
  tint: 'var(--spokes-tint)',
  perfectLabel: 'Found the Nine',
  perfect: (r) => r.nine,

  async load(date) {
    return dayData('spokes', date);
  },

  summary(r, date) {
    if (!r?.found?.length) return 'Fresh wheel, ready to roll';
    return `${r.rankName} · ${r.found.length} word${r.found.length === 1 ? '' : 's'}${r.nine ? ' · Nine ✓' : ''}`;
  },

  statsSummary(records) {
    const all = Object.values(records).filter((r) => r.found?.length);
    const s = streaks(records, (r) => r.yellow);
    return [[all.length, 'Played'], [all.filter((r) => r.nine).length, 'Nines'], [s.current, 'Streak']];
  },

  stats(records) {
    const all = Object.values(records).filter((r) => r.found?.length);
    const s = streaks(records, (r) => r.yellow);
    const words = all.reduce((n, r) => n + r.found.length, 0);
    return h(
      'div',
      null,
      statRow([[all.length, 'Played'], [all.filter((r) => r.nine).length, 'Nines found'], [all.filter((r) => r.yellow).length, 'Yellow Jerseys'], [all.filter((r) => r.top).length, 'Hors Catégorie']]),
      statRow([[s.current, 'Yellow Jersey streak'], [s.max, 'Best streak'], [words, 'Words found']]),
      h('p', { class: 'fine' }, 'Your streak grows each day you reach Yellow Jersey on the day.'),
    );
  },

  help() {
    return [
      h('p', null, 'Make as many words as you can from the nine letters on the wheel.'),
      h('ul', null,
        h('li', null, 'Words must be at least four letters long.'),
        h('li', null, 'Every word must include the red ', h('b', null, 'hub'), ' letter.'),
        h('li', null, 'Each tile can be used only once in a word.'),
        h('li', null, 'No proper nouns, hyphenated words, or plurals made by adding S.'),
      ),
      h('p', null, h('b', null, 'Scoring: '), 'four-letter words score 1 point, five letters 2, six letters 3 and so on. ', h('b', null, 'The Nine'), ' — a word using every tile — scores 10.'),
      h('p', null, 'Climb the ranks from Stabilisers to Yellow Jersey. Find every word for ', h('i', null, 'Hors Catégorie'), '.'),
      h('p', null, 'Type on a keyboard or tap the wheel. Tap ', h('b', null, 'Shuffle'), ' for a fresh look at the letters.'),
    ];
  },

  mount(ctx) {
    const p = ctx.data; // {c: hub, o: outer letters, w: words, n: nines}
    const valid = new Set(p.w);
    const max = maxScore(p.w);
    const r = ctx.rec || { found: [], score: 0, nine: false };
    let outer = p.o.split('');
    let picked = []; // indices: 0..7 outer, 8 hub

    // ----- DOM
    const rankName = h('strong', { class: 'sp-rank' });
    const scoreEl = h('span', { class: 'sp-score' });
    const track = h('div', { class: 'sp-track' }, RANKS.map(() => h('i')), h('div', { class: 'sp-fill' }));
    const rankBar = h('button', { class: 'sp-rankbar', onclick: showRanks }, h('div', { class: 'sp-rank-line' }, rankName, scoreEl), track);
    const foundCount = h('span');
    const foundPreview = h('span', { class: 'sp-preview' });
    const foundBtn = h('button', { class: 'sp-found', onclick: showWords }, foundCount, foundPreview, h('span', { class: 'sp-chev', html: ICON.chevR }));
    const input = h('div', { class: 'sp-input', 'aria-live': 'polite' });
    const wheel = S('svg', { viewBox: '-110 -110 220 220', class: 'sp-wheel', role: 'group', 'aria-label': 'Letter wheel' });
    const segs = [];
    const R1 = 104, R0 = 40;
    for (let k = 0; k < 8; k++) {
      const a0 = (-90 - 22.5 + k * 45) * (Math.PI / 180), a1 = a0 + Math.PI / 4;
      const pt = (rad, a) => `${(rad * Math.cos(a)).toFixed(2)} ${(rad * Math.sin(a)).toFixed(2)}`;
      const path = S('path', { d: `M ${pt(R0, a0)} L ${pt(R1, a0)} A ${R1} ${R1} 0 0 1 ${pt(R1, a1)} L ${pt(R0, a1)} A ${R0} ${R0} 0 0 0 ${pt(R0, a0)} Z`, class: 'sp-seg' });
      const am = a0 + Math.PI / 8;
      const text = S('text', { x: (72 * Math.cos(am)).toFixed(2), y: (72 * Math.sin(am)).toFixed(2), class: 'sp-letter', 'dominant-baseline': 'central', 'text-anchor': 'middle' });
      const g = S('g', { class: 'sp-g', 'data-i': k, role: 'button', tabindex: '-1' }, path, text);
      segs.push({ g, text });
      wheel.append(g);
    }
    const hubText = S('text', { x: 0, y: 0, class: 'sp-letter hub', 'dominant-baseline': 'central', 'text-anchor': 'middle' }, p.c.toUpperCase());
    const hub = S('g', { class: 'sp-g hub', 'data-i': 8, role: 'button' }, S('circle', { r: R0 - 4, class: 'sp-hub' }), hubText);
    wheel.append(hub);
    wheel.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.sp-g');
      if (!g) return;
      e.preventDefault();
      tap(+g.dataset.i);
    });

    const btns = h(
      'div',
      { class: 'sp-btns' },
      h('button', { class: 'btn ghost', onclick: () => del() }, 'Delete'),
      h('button', { class: 'btn ghost round', 'aria-label': 'Shuffle', onclick: shuffle, html: ICON.shuffle }),
      h('button', { class: 'btn ghost', onclick: () => submit() }, 'Enter'),
    );
    const pastTools = ctx.date < today() ? h('button', { class: 'linkish', onclick: showAnswers }, 'Reveal the answers') : null;
    ctx.root.append(h('div', { class: 'sp-wrap' }, rankBar, foundBtn, input, wheel, btns, pastTools));

    // ----- rendering
    function letterAt(i) {
      return i === 8 ? p.c : outer[i];
    }
    function render() {
      outer.forEach((ch, k) => (segs[k].text.textContent = ch.toUpperCase()));
      segs.forEach((s, k) => s.g.classList.toggle('used', picked.includes(k)));
      hub.classList.toggle('used', picked.includes(8));
      input.replaceChildren(...picked.map((i) => h('span', { class: i === 8 ? 'hub' : '' }, letterAt(i).toUpperCase())), h('span', { class: 'caret' }));
      const rk = rankOf(r.score, max);
      rankName.textContent = rk.name;
      scoreEl.textContent = `${r.score} pts`;
      const frac = Math.min(1, r.score / Math.max(1, Math.ceil(RANKS.at(-1)[1] * max)));
      track.querySelector('.sp-fill').style.width = `${frac * 100}%`;
      [...track.querySelectorAll('i')].forEach((dot, i) => dot.classList.toggle('on', i <= rk.index));
      foundCount.textContent = `${r.found.length} word${r.found.length === 1 ? '' : 's'}`;
      foundPreview.textContent = r.found.length ? r.found.slice(-6).reverse().map((w) => w[0].toUpperCase() + w.slice(1)).join('  ') : 'Your words will appear here';
    }
    render();

    function tap(i) {
      if (picked.includes(i)) {
        // tapping a used tile removes it (and anything after it)
        picked = picked.slice(0, picked.indexOf(i));
      } else if (picked.length < 9) picked.push(i);
      render();
    }
    function typeLetter(ch) {
      if (ch === p.c && !picked.includes(8)) return tap(8);
      const k = outer.findIndex((c, idx) => c === ch && !picked.includes(idx));
      if (k >= 0) return tap(k);
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
    }
    function del() {
      picked.pop();
      render();
    }
    function shuffle() {
      const keep = picked.map((i) => (i === 8 ? '#' : outer[i]));
      for (let i = outer.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [outer[i], outer[j]] = [outer[j], outer[i]];
      }
      // re-map picked letters onto new positions
      const used = new Set();
      picked = keep.map((ch) => {
        if (ch === '#') return 8;
        const k = outer.findIndex((c, idx) => c === ch && !used.has(idx));
        used.add(k);
        return k;
      });
      wheel.classList.remove('spin');
      void wheel.offsetWidth;
      wheel.classList.add('spin');
      render();
    }
    function reject(msg) {
      toast(msg);
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      setTimeout(() => { picked = []; render(); }, 450);
    }
    function submit() {
      const word = picked.map(letterAt).join('');
      if (!word) return;
      if (word.length < 4) return reject('Too short');
      if (!picked.includes(8)) return reject(`Must use the hub letter, ${p.c.toUpperCase()}`);
      if (r.found.includes(word)) return reject('Already found');
      if (!valid.has(word)) return reject('Not in our word list');
      const before = rankOf(r.score, max).name;
      r.found.push(word);
      r.score += points(word);
      if (word.length === 9) {
        r.nine = true;
        toast('The Nine! +10', { tone: 'big' });
        confetti(['#D9483B', '#F3C14B', '#2F7A8C', '#FFFFFF']);
      } else toast(`${PRAISE[word.length - 3]} +${points(word)}`);
      const rk = rankOf(r.score, max);
      r.rankName = rk.name;
      r.progress = r.score;
      picked = [];
      render();
      if (rk.index === RANKS.length && !r.top) {
        r.top = true;
        ctx.save(r);
        setTimeout(() => ctx.showResult({ headline: 'Hors Catégorie!', sub: 'Every single word. Chapeau.', shareText: shareText() }), 1300);
      } else if (rk.index >= RANKS.length - 1 && !r.yellow) {
        // Reaching Yellow Jersey counts as finishing the puzzle (and, on the day, for your streak).
        r.yellow = true;
        r.win = true;
        ctx.finish(r, { headline: 'Yellow Jersey!', sub: `Top rank with ${r.found.length} words. Keep spinning for Hors Catégorie.`, shareText: shareText(), delay: 1300 });
      } else ctx.save(r);
      if (rk.name !== before && !(rk.index >= RANKS.length - 1)) setTimeout(() => toast(`New rank: ${rk.name}`), 900);
    }
    function shareText() {
      return `Spokes No. ${puzzleNo(ctx.date)} — ${rankOf(r.score, max).name}\n${r.found.length} words · ${r.score} pts${r.nine ? ' · found the Nine 🔴' : ''}`;
    }
    function showWords() {
      const sorted = [...r.found].sort();
      modal(
        h('div', { class: 'sp-list' }, sorted.length ? h('ul', { class: 'cols' }, sorted.map((w) => h('li', { class: w.length === 9 ? 'nine' : '' }, w[0].toUpperCase() + w.slice(1)))) : h('p', null, 'No words yet — have a spin!'), h('p', { class: 'fine' }, `${r.found.length} of ${p.w.length} words · ${r.score} of ${max} points`)),
        { title: 'Your words' },
      );
    }
    function showRanks() {
      const rk = rankOf(r.score, max);
      modal(
        h('div', { class: 'sp-ranks' },
          h('p', null, 'Ranks are based on a percentage of the possible points in today’s wheel.'),
          h('ul', null,
            [...RANKS, [TOP, 1]].reverse().map(([name, f], i, arr) => h('li', { class: name === rk.name ? 'on' : '' }, h('span', null, name), h('b', null, Math.ceil(f * max))))),
          h('p', { class: 'fine' }, `The Nine: ${p.n.length > 1 ? 'there are ' + p.n.length + ' today' : 'there’s one today'}.`)),
        { title: 'Rankings' },
      );
    }
    function showAnswers() {
      modal(
        h('div', { class: 'sp-list' }, h('ul', { class: 'cols' }, p.w.map((w) => h('li', { class: `${r.found.includes(w) ? 'got' : 'miss'} ${w.length === 9 ? 'nine' : ''}` }, w[0].toUpperCase() + w.slice(1)))), h('p', { class: 'fine' }, 'Words you found are ticked; the Nine is in red.')),
        { title: `Answers — No. ${puzzleNo(ctx.date)}` },
      );
    }
    const off = onPhysicalKeys((k) => {
      if (k === 'enter') submit();
      else if (k === 'back') del();
      else if (k === ' ') shuffle();
      else if (/^[a-z]$/.test(k)) typeLetter(k);
      else return false;
    }, ctx.alive);
    return () => { off(); closeModal(); };
  },
};
