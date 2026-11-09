// Spokes — seven letters on a wheel. Every word uses the hub; letters can be used again;
// every puzzle has at least one "Full Circle" word that uses all seven letters.
import { h, dayData, toast, statRow, streaks, puzzleNo, onPhysicalKeys, ICON, today, confetti, modal, closeModal, store, reduceMotion, EASE, fadeIn } from '../core.js';

const VERSION = 2; // v1 was the nine-letter, use-each-tile-once wheel
const RANKS = [
  ['Stabilisers', 0],
  ['Pootling', 0.02],
  ['Freewheeling', 0.05],
  ['Club Run', 0.1],
  ['Peloton', 0.18],
  ['Breakaway', 0.28],
  ['Polka Dot', 0.4],
  ['Yellow Jersey', 0.55],
];
const TOP = 'Hors Catégorie';
const FULL_BONUS = 10;
const isFull = (w, set) => [...set].every((ch) => w.includes(ch));
export const points = (w, set) => Math.max(1, w.length - 3) + (isFull(w, set) ? FULL_BONUS : 0);
const PRAISE = ['', 'Good!', 'Nice!', 'Great!', 'Superb!', 'Magnificent!'];
const S = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};
const cap = (w) => w[0].toUpperCase() + w.slice(1);

// Hors Catégorie means finding every counted word; bonus words add points but aren't needed.
function rankOf(score, max, complete) {
  if (complete) return { name: TOP, index: RANKS.length };
  let idx = 0;
  RANKS.forEach(([, f], i) => score >= Math.ceil(f * max) && (idx = i));
  return { name: RANKS[idx][0], index: idx };
}
// Records from the old nine-letter version don't fit the new puzzles, so drop them once.
store.prune?.('spokes', (r) => r?.v === VERSION);
const current = (records) => Object.values(records).filter((r) => r?.v === VERSION);

export default {
  id: 'spokes',
  name: 'Spokes',
  short: 'Spokes',
  blurb: 'How many words can you spin from seven letters?',
  tagline: 'Seven letters, one hub. Make words that use the hub, reuse letters freely, and go Full Circle with a word that uses all seven.',
  color: 'var(--spokes)',
  tint: 'var(--spokes-tint)',
  perfectLabel: 'Went Full Circle',
  perfect: (r) => r.full > 0,

  async load(date) {
    return dayData('spokes', date);
  },

  summary(r) {
    if (!r?.found?.length || r.v !== VERSION) return 'Fresh wheel, ready to roll';
    return `${r.rankName} · ${r.found.length} word${r.found.length === 1 ? '' : 's'}${r.full ? ' · Full Circle ✓' : ''}`;
  },

  statsSummary(records) {
    const all = current(records).filter((r) => r.found?.length);
    const s = streaks(records, (r) => r.v === VERSION && r.yellow);
    return [[all.length, 'Played'], [all.filter((r) => r.yellow).length, 'Yellow'], [s.current, 'Streak']];
  },

  stats(records) {
    const all = current(records).filter((r) => r.found?.length);
    const s = streaks(records, (r) => r.v === VERSION && r.yellow);
    const words = all.reduce((n, r) => n + r.found.length, 0);
    return h(
      'div',
      null,
      statRow([[all.length, 'Played'], [all.filter((r) => r.full).length, 'Full Circles'], [all.filter((r) => r.yellow).length, 'Yellow Jerseys'], [all.filter((r) => r.top).length, 'Hors Catégorie']]),
      statRow([[s.current, 'Yellow Jersey streak'], [s.max, 'Best streak'], [words, 'Words found']]),
      h('p', { class: 'fine' }, 'Your streak grows each day you reach Yellow Jersey on the day.'),
    );
  },

  help() {
    return [
      h('p', null, 'Make as many words as you can from the seven letters on the wheel.'),
      h('ul', null,
        h('li', null, 'Words must be at least four letters long.'),
        h('li', null, 'Every word must include the red ', h('b', null, 'hub'), ' letter.'),
        h('li', null, 'Letters can be used more than once in a word.'),
        h('li', null, 'No proper nouns or hyphenated words.'),
        h('li', null, 'Less common words are accepted as ', h('b', null, 'bonus words'), '. They score points but you don’t need them for Hors Catégorie.'),
      ),
      h('p', null, h('b', null, 'Scoring: '), 'four-letter words score 1 point, five letters 2, six letters 3 and so on.'),
      h('p', null, 'Every wheel has at least one ', h('b', null, 'Full Circle'), ': a word that uses all seven letters. It scores 10 bonus points.'),
      h('p', null, 'Climb the ranks from Stabilisers to Yellow Jersey. Find every word for ', h('i', null, 'Hors Catégorie'), '.'),
      h('p', null, 'Type on a keyboard or tap the wheel. Tap ', h('b', null, 'Shuffle'), ' for a fresh look at the letters.'),
      h('p', null, 'Stuck? Tap ', h('b', null, 'Hints'), ' to see how many words are left by first letter and length, or to reveal the start of a word.'),
    ];
  },

  mount(ctx) {
    const p = ctx.data; // {c: hub, o: six outer letters, w: words, n: Full Circle words}
    const set = new Set(p.c + p.o);
    const valid = new Set(p.w);
    const bonus = new Set(p.x || []); // less common words: accepted and scored, but not needed
    const max = p.w.reduce((s, w) => s + points(w, set), 0);
    const r = ctx.rec?.v === VERSION ? ctx.rec : { v: VERSION, found: [], score: 0, full: 0 };
    const complete = () => p.w.every((w) => r.found.includes(w));
    let outer = p.o.split('');
    let typed = '';

    // ----- DOM
    const rankName = h('strong', { class: 'sp-rank' });
    const scoreEl = h('span', { class: 'sp-score' });
    const track = h('div', { class: 'sp-track' }, RANKS.map(() => h('i')), h('div', { class: 'sp-fill' }));
    const rankBar = h('button', { class: 'sp-rankbar', onclick: showRanks }, h('div', { class: 'sp-rank-line' }, rankName, scoreEl), track);
    const foundCount = h('span');
    const foundPreview = h('span', { class: 'sp-preview' });
    const foundBtn = h('button', { class: 'sp-found', onclick: showWords }, foundCount, foundPreview, h('span', { class: 'sp-chev', html: ICON.chevR }));
    const hintsBtn = h('button', { class: 'btn ghost sp-hints-btn', onclick: showHints, html: ICON.bulb + '<span>Hints</span>' });
    const input = h('div', { class: 'sp-input', 'aria-live': 'polite' });
    const wheel = S('svg', { viewBox: '-110 -110 220 220', class: 'sp-wheel', role: 'group', 'aria-label': 'Letter wheel' });
    const segs = [];
    const R1 = 104, R0 = 42, SEG = 6;
    for (let k = 0; k < SEG; k++) {
      const a0 = (-90 - 30 + k * 60) * (Math.PI / 180), a1 = a0 + Math.PI / 3;
      const pt = (rad, a) => `${(rad * Math.cos(a)).toFixed(2)} ${(rad * Math.sin(a)).toFixed(2)}`;
      const path = S('path', { d: `M ${pt(R0, a0)} L ${pt(R1, a0)} A ${R1} ${R1} 0 0 1 ${pt(R1, a1)} L ${pt(R0, a1)} A ${R0} ${R0} 0 0 0 ${pt(R0, a0)} Z`, class: 'sp-seg' });
      const am = a0 + Math.PI / 6;
      const text = S('text', { x: (73 * Math.cos(am)).toFixed(2), y: (73 * Math.sin(am)).toFixed(2), class: 'sp-letter', 'dominant-baseline': 'central', 'text-anchor': 'middle' });
      const g = S('g', { class: 'sp-g', 'data-i': k, role: 'button' }, path, text);
      segs.push({ g, text });
      wheel.append(g);
    }
    const hub = S('g', { class: 'sp-g hub', 'data-i': 'hub', role: 'button' }, S('circle', { r: R0 - 4, class: 'sp-hub' }), S('text', { x: 0, y: 0, class: 'sp-letter hub', 'dominant-baseline': 'central', 'text-anchor': 'middle' }, p.c.toUpperCase()));
    wheel.append(hub);
    wheel.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.sp-g');
      if (!g) return;
      e.preventDefault();
      g.classList.remove('tap');
      void g.getBoundingClientRect();
      g.classList.add('tap');
      add(g.dataset.i === 'hub' ? p.c : outer[+g.dataset.i]);
    });

    const btns = h(
      'div',
      { class: 'sp-btns' },
      h('button', { class: 'btn ghost', onclick: () => del() }, 'Delete'),
      h('button', { class: 'btn ghost round', 'aria-label': 'Shuffle', onclick: shuffle, html: ICON.shuffle }),
      h('button', { class: 'btn ghost', onclick: () => submit() }, 'Enter'),
    );
    const pastTools = ctx.date < today() ? h('button', { class: 'linkish', onclick: showAnswers }, 'Reveal the answers') : null;
    ctx.root.append(h('div', { class: 'sp-wrap' }, rankBar, h('div', { class: 'sp-row' }, foundBtn, hintsBtn), input, wheel, btns, pastTools));

    // ----- rendering
    function render() {
      outer.forEach((ch, k) => (segs[k].text.textContent = ch.toUpperCase()));
      input.replaceChildren(...typed.split('').map((ch) => h('span', { class: ch === p.c ? 'hub' : '' }, ch.toUpperCase())), h('span', { class: 'caret' }));
      input.classList.toggle('long', typed.length > 10);
      const rk = rankOf(r.score, max, complete());
      rankName.textContent = rk.name;
      scoreEl.textContent = `${r.score} pts`;
      const frac = Math.min(1, r.score / Math.max(1, Math.ceil(RANKS.at(-1)[1] * max)));
      track.querySelector('.sp-fill').style.width = `${frac * 100}%`;
      [...track.querySelectorAll('i')].forEach((dot, i) => dot.classList.toggle('on', i <= rk.index));
      foundCount.textContent = `${r.found.length} word${r.found.length === 1 ? '' : 's'}`;
      foundPreview.textContent = r.found.length ? r.found.slice(-6).reverse().map(cap).join('  ') : 'Your words will appear here';
    }
    render();

    function add(ch) {
      if (typed.length >= 19) return;
      typed += ch;
      render();
    }
    function shake() {
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
    }
    function del() {
      typed = typed.slice(0, -1);
      render();
    }
    function shuffle() {
      for (let i = outer.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [outer[i], outer[j]] = [outer[j], outer[i]];
      }
      wheel.classList.remove('spin');
      void wheel.getBoundingClientRect();
      wheel.classList.add('spin');
      render();
    }
    // An accepted word lifts and fades from the input while the input clears for the next one.
    function floatAway() {
      if (reduceMotion() || !input.animate) return;
      const b = input.getBoundingClientRect();
      const ghost = input.cloneNode(true);
      ghost.querySelector('.caret')?.remove();
      Object.assign(ghost.style, { position: 'fixed', left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, margin: '0', pointerEvents: 'none', zIndex: '5' });
      document.body.append(ghost);
      ghost.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-22px) scale(0.92)', opacity: 0 }], { duration: 380, easing: EASE }).finished.finally(() => ghost.remove());
    }
    function reject(msg) {
      toast(msg);
      shake();
      setTimeout(() => { typed = ''; render(); }, 450);
    }
    function submit() {
      const word = typed;
      if (!word) return;
      if ([...word].some((ch) => !set.has(ch))) return reject('Only use letters on the wheel');
      if (word.length < 4) return reject('Too short');
      if (!word.includes(p.c)) return reject(`Must use the hub letter, ${p.c.toUpperCase()}`);
      if (r.found.includes(word)) return reject('Already found');
      if (!valid.has(word) && !bonus.has(word)) return reject('Not in our word list');
      const before = rankOf(r.score, max, complete()).name;
      const pts = points(word, set);
      r.found.push(word);
      r.score += pts;
      if (isFull(word, set)) {
        r.full = (r.full || 0) + 1;
        toast(`Full Circle! +${pts}`, { tone: 'big' });
        confetti(['#D9483B', '#F3C14B', '#2F7A8C', '#FFFFFF']);
      } else toast(bonus.has(word) ? `Bonus word! +${pts}` : `${PRAISE[Math.min(5, word.length - 3)]} +${pts}`);
      const rk = rankOf(r.score, max, complete());
      r.rankName = rk.name;
      r.progress = r.score;
      floatAway();
      typed = '';
      render();
      fadeIn(foundPreview, { dx: -8, dy: 0, duration: 300 });
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
      if (rk.name !== before && rk.index < RANKS.length - 1) setTimeout(() => toast(`New rank: ${rk.name}`), 900);
    }
    function shareText() {
      return `Spokes No. ${puzzleNo(ctx.date)} — ${rankOf(r.score, max, complete()).name}\n${r.found.length} words · ${r.score} pts${r.full ? ' · Full Circle 🔴' : ''}`;
    }
    function showWords() {
      const sorted = [...r.found].sort();
      modal(
        h('div', { class: 'sp-list' }, sorted.length ? h('ul', { class: 'cols' }, sorted.map((w) => h('li', { class: `${isFull(w, set) ? 'full' : ''} ${bonus.has(w) ? 'bonus' : ''}` }, cap(w)))) : h('p', null, 'No words yet. Have a spin!'), h('p', { class: 'fine' }, `${r.found.filter((w) => valid.has(w)).length} of ${p.w.length} words · ${r.score} points${r.found.some((w) => bonus.has(w)) ? ' · words marked + are bonus words' : ''}`)),
        { title: 'Your words' },
      );
    }
    // ----- hints
    const unfound = () => p.w.filter((w) => !r.found.includes(w));
    function hintsBody() {
      const left = unfound();
      const all = p.w;
      const maxLen = Math.max(...all.map((w) => w.length));
      const cols = [];
      for (let L = 4; L <= Math.min(maxLen, 9); L++) cols.push(L);
      const hasLong = maxLen >= 10;
      const colOf = (w) => (w.length >= 10 ? '10+' : w.length);
      const firsts = [...new Set(all.map((w) => w[0]))].sort();
      const count = (list, ch, col) => list.filter((w) => w[0] === ch && (col == null || colOf(w) === col)).length;
      const colKeys = [...cols, ...(hasLong ? ['10+'] : [])];
      const cell = (n, total) => h('td', { class: !total ? 'none' : n ? '' : 'done' }, !total ? '·' : n || '✓');
      const table = h(
        'table',
        { class: 'sp-hint-grid' },
        h('thead', null, h('tr', null, h('th', null, ''), colKeys.map((c) => h('th', null, c)), h('th', null, 'Σ'))),
        h(
          'tbody',
          null,
          firsts.map((ch) => h('tr', null, h('th', null, ch.toUpperCase()), colKeys.map((c) => cell(count(left, ch, c), count(all, ch, c))), cell(count(left, ch), count(all, ch)))),
          h('tr', { class: 'sum' }, h('th', null, 'Σ'), colKeys.map((c) => cell(left.filter((w) => colOf(w) === c).length, all.filter((w) => colOf(w) === c).length)), cell(left.length, all.length)),
        ),
      );
      const twos = {};
      for (const w of left) twos[w.slice(0, 2)] = (twos[w.slice(0, 2)] || 0) + 1;
      const fullLeft = p.n.filter((w) => !r.found.includes(w)).length;
      const nudges = r.nudges || [];
      return h(
        'div',
        { class: 'sp-hints' },
        h('p', { class: 'sp-hint-sum' }, `${left.length} of ${all.length} words still to find · ${max - r.score} points left · ${fullLeft ? `${fullLeft} Full Circle${fullLeft > 1 ? 's' : ''} to go` : 'Full Circle found'}`),
        h('h3', { class: 'sub-head' }, 'Words left, by first letter and length'),
        h('div', { class: 'sp-hint-scroll' }, table),
        h('h3', { class: 'sub-head' }, 'Words left, by first two letters'),
        h('p', { class: 'sp-twos' }, Object.keys(twos).length ? Object.entries(twos).sort().map(([k, n]) => h('span', null, k.toUpperCase(), h('b', null, ` ×${n}`))) : 'None. You’ve found them all!'),
        h('h3', { class: 'sub-head' }, 'Still stuck?'),
        nudges.length
          ? h('ul', { class: 'sp-nudges' }, nudges.map((w) => h('li', { class: r.found.includes(w) ? 'got' : '' }, r.found.includes(w) ? cap(w) : `${[...w.slice(0, w.length >= 7 ? 3 : 2).toUpperCase(), ...'_'.repeat(w.length - (w.length >= 7 ? 3 : 2))].join(' ')}   (${w.length})`)))
          : null,
        left.filter((w) => !nudges.includes(w)).length
          ? h('button', { class: 'btn ghost sm', onclick: nudge }, 'Show me the start of a word')
          : null,
      );
    }
    function nudge() {
      const options = unfound().filter((w) => !(r.nudges || []).includes(w));
      if (!options.length) return;
      // Prefer a word you can realistically spot: avoid the very longest unless that's all that's left.
      options.sort((a, b) => a.length - b.length);
      const pick = options[Math.floor(Math.random() * Math.max(1, Math.ceil(options.length * 0.7)))];
      r.nudges = [...(r.nudges || []), pick];
      r.hints = (r.hints || 0) + 1;
      ctx.save(r);
      showHints();
    }
    function showHints() {
      modal(hintsBody(), { title: 'Hints', cls: 'tall' });
    }
    function showRanks() {
      const rk = rankOf(r.score, max, complete());
      modal(
        h('div', { class: 'sp-ranks' },
          h('p', null, 'Ranks are based on a percentage of the possible points in today’s wheel.'),
          h('ul', null, [...RANKS, [TOP, 1]].reverse().map(([name, f]) => h('li', { class: name === rk.name ? 'on' : '' }, h('span', null, name), h('b', null, name === TOP ? 'Every word' : Math.ceil(f * max))))),
          h('p', { class: 'fine' }, `Full Circle words today: ${p.n.length}.`)),
        { title: 'Rankings' },
      );
    }
    function showAnswers() {
      modal(
        h('div', { class: 'sp-list' }, h('ul', { class: 'cols' }, p.w.map((w) => h('li', { class: `${r.found.includes(w) ? 'got' : 'miss'} ${isFull(w, set) ? 'full' : ''}` }, cap(w)))), h('p', { class: 'fine' }, 'Words you found are ticked; Full Circle words are in red.')),
        { title: `Answers: No. ${puzzleNo(ctx.date)}` },
      );
    }
    const off = onPhysicalKeys((k) => {
      if (k === 'enter') submit();
      else if (k === 'back') del();
      else if (k === ' ') shuffle();
      else if (/^[a-z]$/.test(k)) {
        if (set.has(k)) add(k);
        else shake();
      } else return false;
    }, ctx.alive);
    return () => { off(); closeModal(); };
  },
};
