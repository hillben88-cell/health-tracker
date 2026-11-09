// Quartets — find four groups of four.
import { h, dayData, toast, statRow, distribution, streaks, puzzleNo, confetti, ICON, flip, wait, reduceMotion } from '../core.js';

const LIVES = 4;
const EMOJI = ['🟩', '🟧', '🟦', '🟪'];
const fitClass = (word) => {
  const longest = Math.max(...word.split(/[\s-]/).map((p) => p.length));
  if (word.length > 15 || longest > 9) return 'xs';
  if (word.length > 10 || longest > 7) return 'sm';
  return '';
};

export default {
  id: 'quartets',
  name: 'Quartets',
  short: 'Quartets',
  blurb: 'Sort sixteen words into four hidden groups.',
  tagline: 'Sixteen words, four groups of four. Spot what links them — but watch the red herrings.',
  color: 'var(--quartets)',
  tint: 'var(--quartets-tint)',
  perfectLabel: 'No mistakes, no hints',
  perfect: (r) => r.win && r.mistakes === 0 && !r.hints,

  load: (date) => dayData('quartets', date),

  summary(r) {
    if (!r) return 'Sixteen words await';
    const hints = r.hints ? ` · ${r.hints} hint${r.hints > 1 ? 's' : ''}` : '';
    if (r.done) return r.win ? (r.mistakes ? `Solved with ${r.mistakes} mistake${r.mistakes > 1 ? 's' : ''}${hints}` : `Solved, no mistakes${hints}`) : 'Out of lives this time';
    return `${r.solved.length} of 4 groups found`;
  },
  statsSummary(records) {
    const all = Object.values(records).filter((r) => r.done);
    const s = streaks(records, (r) => r.win);
    return [[all.length, 'Played'], [all.length ? Math.round((all.filter((r) => r.win).length / all.length) * 100) + '%' : '–', 'Win %'], [s.current, 'Streak']];
  },
  stats(records, date) {
    const all = Object.values(records).filter((r) => r.done);
    const wins = all.filter((r) => r.win);
    const s = streaks(records, (r) => r.win);
    const today = date && records[date];
    return h(
      'div',
      null,
      statRow([[all.length, 'Completed'], [all.length ? Math.round((wins.length / all.length) * 100) : 0, 'Win %'], [s.current, 'Current streak'], [s.max, 'Max streak']]),
      statRow([[wins.filter((r) => r.mistakes === 0 && !r.hints).length, 'Perfect puzzles'], [wins.filter((r) => !r.hints).length, 'Solved without hints']]),
      h('h3', { class: 'sub-head' }, 'Mistakes'),
      distribution([0, 1, 2, 3].map((n) => [n, wins.filter((r) => r.mistakes === n).length, today?.win && today.mistakes === n]).concat([['✗', all.length - wins.length, today && !today.win]])),
    );
  },
  help() {
    return [
      h('p', null, 'Find four groups of four words that share something in common.'),
      h('ul', null, h('li', null, 'Tap four words and press ', h('b', null, 'Submit'), ' to check your guess.'), h('li', null, 'Find the groups without making four mistakes.'), h('li', null, 'Each puzzle has exactly one solution. Watch out for words that seem to fit more than one group!')),
      h('p', null, 'Groups get trickier by colour:'),
      h('div', { class: 'q-legend' }, ['Straightforward', 'Getting there', 'Tricky', 'Devious — often wordplay'].map((t, i) => h('div', { class: `q-legend-row q${i}` }, h('i'), t))),
      h('p', null, 'Stuck? Tap ', h('b', null, 'Hint'), '. The first hint tells you what one group is, starting with the easiest. Later hints mark words that belong to it. A perfect game is one with no mistakes and no hints.'),
      h('p', null, 'Examples: ', h('b', null, 'British puddings'), ' — TRIFLE, CRUMBLE, ETON MESS, SYLLABUB.  ', h('b', null, '___ PIE'), ' — PORK, COTTAGE, HUMBLE, MAG.'),
      h('p', null, 'A fresh puzzle lands every midnight.'),
    ];
  },

  mount(ctx) {
    const p = ctx.data; // {g: [{t, m:[4]}], o: [16]}
    const groupOf = new Map();
    p.g.forEach((g, i) => g.m.forEach((m) => groupOf.set(m, i)));
    const r = ctx.rec || { solved: [], guesses: [], mistakes: 0, order: p.o.slice() };
    r.order ||= p.o.slice();
    r.hinted ||= {}; // group index -> hint level (1 = theme shown, 2-4 = that many minus one words marked)
    let selected = new Set();
    let busy = false;

    const solvedHost = h('div', { class: 'q-solved' });
    const grid = h('div', { class: 'q-grid' });
    const lives = h('div', { class: 'q-lives' });
    const submitBtn = h('button', { class: 'btn primary', onclick: submit }, 'Submit');
    const deselBtn = h('button', { class: 'btn ghost', onclick: () => { if (busy) return; selected.clear(); render(); } }, 'Deselect all');
    const shuffleBtn = h('button', { class: 'btn ghost', onclick: shuffle }, 'Shuffle');
    const controls = h('div', { class: 'q-controls' }, shuffleBtn, deselBtn, submitBtn);
    const hintBtn = h('button', { class: 'btn ghost sm q-hint-btn', onclick: useHint });
    const hintHost = h('div', { class: 'q-hints' });
    ctx.root.append(h('div', { class: 'q-wrap' }, h('div', { class: 'q-top' }, h('p', { class: 'q-intro' }, 'Create four groups of four!'), hintBtn), hintHost, h('div', { class: 'q-board' }, solvedHost, grid), lives, controls));

    // Words a hint has marked, and the group they belong to.
    function markedWords() {
      const out = new Map();
      for (const [gi, lvl] of Object.entries(r.hinted)) if (!r.solved.includes(+gi)) p.g[gi].m.slice(0, Math.max(0, lvl - 1)).forEach((w) => out.set(w, +gi));
      return out;
    }
    function nextHint() {
      const open = [0, 1, 2, 3].filter((gi) => !r.solved.includes(gi));
      const untitled = open.find((gi) => !r.hinted[gi]);
      if (untitled !== undefined) return [untitled, 1];
      const more = open.find((gi) => r.hinted[gi] < 4);
      return more !== undefined ? [more, r.hinted[more] + 1] : null;
    }
    function useHint() {
      if (r.done || busy) return;
      const next = nextHint();
      if (!next) return toast('No more hints. You can do this!');
      const [gi, lvl] = next;
      r.hinted[gi] = lvl;
      r.hints = (r.hints || 0) + 1;
      ctx.save(r);
      toast(lvl === 1 ? 'Hint: one group revealed' : 'Hint: a word is marked');
      render();
    }

    const barHeight = {}; // height of the tile row each bar replaced, so the board doesn't jump
    const bar = (gi, animate) =>
      h('div', { class: `q-bar q${gi} ${animate ? 'pop' : ''}`, style: barHeight[gi] ? { minHeight: `${barHeight[gi]}px` } : null }, h('strong', null, p.g[gi].t), h('span', null, p.g[gi].m.join(', ')));

    const pending = new Set(); // groups solved but still animating into place
    function remaining() {
      return r.order.filter((w) => !r.solved.includes(groupOf.get(w)) || pending.has(groupOf.get(w)));
    }
    let shownSolved = null;
    function render(newGroup) {
      // Only rebuild the bars when the solved set changes, so a new bar's entrance isn't cut short.
      const bars = r.solved.filter((gi) => !pending.has(gi));
      if (shownSolved !== bars.join()) {
        shownSolved = bars.join();
        solvedHost.replaceChildren(...bars.map((gi) => bar(gi, gi === newGroup)));
      }
      const marked = markedWords();
      grid.replaceChildren(
        ...remaining().map((w) =>
          h('button', { class: `q-tile ${fitClass(w)} ${selected.has(w) ? 'sel' : ''} ${marked.has(w) ? `marked q${marked.get(w)}` : ''}`, 'data-w': w, 'aria-pressed': selected.has(w) ? 'true' : 'false', disabled: r.done || null, onclick: () => toggle(w) }, w),
        ),
      );
      const open = Object.keys(r.hinted).map(Number).filter((gi) => !r.solved.includes(gi)).sort();
      hintHost.replaceChildren(
        ...open.map((gi) =>
          h('div', { class: `q-hint q${gi}` }, h('i'), h('span', null, 'One group is ', h('strong', null, p.g[gi].t), r.hinted[gi] > 1 ? ` (${r.hinted[gi] - 1} word${r.hinted[gi] > 2 ? 's' : ''} marked)` : '')),
        ),
      );
      hintHost.hidden = r.done || !open.length;
      const n = nextHint();
      hintBtn.innerHTML = `${ICON.bulb}<span>${r.hints ? `Hint (${r.hints} used)` : 'Hint'}</span>`;
      hintBtn.disabled = r.done || !n;
      hintBtn.hidden = r.done;
      lives.replaceChildren(h('span', null, 'Mistakes remaining:'), ...Array.from({ length: LIVES }, (_, i) => h('i', { class: i < LIVES - r.mistakes ? 'on' : '' })));
      submitBtn.disabled = selected.size !== 4 || r.done || busy;
      deselBtn.disabled = !selected.size || r.done || busy;
      shuffleBtn.disabled = r.done;
      controls.hidden = r.done;
      lives.hidden = r.done;
    }
    render();

    function toggle(w) {
      if (busy || r.done) return;
      if (selected.has(w)) selected.delete(w);
      else if (selected.size < 4) selected.add(w);
      render();
    }
    function shuffle() {
      if (busy || r.done) return;
      const rest = remaining();
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      r.order = [...p.g.flatMap((g, gi) => (r.solved.includes(gi) ? g.m : [])), ...rest];
      flip(grid, '.q-tile', render, { key: byWord, duration: 420 });
    }
    const byWord = (el) => el.dataset.w;
    /**
     * The solve animation: the group's tiles glide into the top row (the others make room),
     * take on the group's colour, then merge into its bar.
     */
    async function settle(gi) {
      const words = p.g[gi].m;
      const left = remaining();
      r.order = [...r.order.filter((w) => !left.includes(w)), ...left.filter((w) => words.includes(w)), ...left.filter((w) => !words.includes(w))];
      const lift = () => {
        render();
        grid.querySelectorAll('.q-tile').forEach((t) => words.includes(t.dataset.w) && t.classList.add('lift'));
      };
      await flip(grid, '.q-tile', lift, { key: byWord, duration: 600, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' });
      if (!ctx.alive()) return;
      grid.querySelectorAll('.q-tile').forEach((t) => words.includes(t.dataset.w) && (t.dataset.solve = gi));
      barHeight[gi] = grid.querySelector('.q-tile')?.getBoundingClientRect().height;
      await wait(reduceMotion() ? 150 : 300);
    }
    const tileEls = () => [...grid.querySelectorAll('.q-tile')].filter((t) => selected.has(t.dataset.w));
    function submit() {
      if (selected.size !== 4 || busy) return;
      const guess = [...selected].sort();
      const key = guess.join('|');
      if (r.guesses.some((g) => g.join('|') === key)) return toast('Already guessed!');
      r.guesses.push(guess);
      busy = true;
      render();
      tileEls().forEach((t, i) => setTimeout(() => t.classList.add('hop'), i * 90));
      setTimeout(() => {
        const counts = {};
        guess.forEach((w) => (counts[groupOf.get(w)] = (counts[groupOf.get(w)] || 0) + 1));
        const best = Math.max(...Object.values(counts));
        if (best === 4) {
          const gi = groupOf.get(guess[0]);
          const last = r.solved.length === 3;
          r.solved.push(gi);
          pending.add(gi); // still shown as tiles while they animate
          if (!last) ctx.save(r); // saved straight away, so leaving mid-animation keeps the solve
          settle(gi).then(() => {
            if (!ctx.alive()) return;
            pending.delete(gi);
            selected.clear();
            busy = false;
            render(gi);
            if (last) {
              r.win = true;
              confetti(['#7FCFAE', '#F4B27A', '#8DB8EE', '#B79BE8']);
              ctx.finish(r, { headline: r.mistakes === 0 && !r.hints ? 'Perfect!' : ['Nicely done!', 'Great stuff!', 'Got there!', 'Phew, just made it!'][r.mistakes], sub: `Solved with ${r.mistakes} mistake${r.mistakes === 1 ? '' : 's'}${r.hints ? ` and ${r.hints} hint${r.hints === 1 ? '' : 's'}` : ''}.`, shareText: shareText(), delay: 1000 });
            }
          });
        } else {
          r.mistakes++;
          tileEls().forEach((t) => { t.classList.remove('hop'); t.classList.add('shake'); });
          toast(best === 3 ? 'One away…' : r.mistakes >= LIVES ? 'Next time!' : 'Not quite');
          setTimeout(() => {
            busy = false;
            if (r.mistakes >= LIVES) return lose();
            ctx.save(r);
            render();
          }, 650);
        }
      }, 520);
    }
    async function lose() {
      r.win = false;
      selected.clear();
      const missing = [0, 1, 2, 3].filter((gi) => !r.solved.includes(gi));
      ctx.finish(r, { headline: 'Next time!', sub: 'Out of lives — here’s how it fitted together.', shareText: shareText(), delay: 900 + missing.length * 1100 });
      render();
      await wait(500);
      for (const gi of missing) {
        if (!ctx.alive()) return;
        await settle(gi);
        if (!ctx.alive()) return;
        r.solved.push(gi);
        ctx.save(r);
        render(gi);
        await wait(250);
      }
    }
    // A lost puzzle reopened later shows the full solution.
    if (r.done && r.solved.length < 4) {
      r.solved.push(...[0, 1, 2, 3].filter((gi) => !r.solved.includes(gi)));
      render();
    }
    function shareText() {
      const rows = r.guesses.map((g) => g.map((w) => EMOJI[groupOf.get(w)]).join('')).join('\n');
      return `Quartets No. ${puzzleNo(ctx.date)}${r.hints ? ` · 💡${r.hints}` : ''}\n${rows}`;
    }
    return () => {};
  },
};
