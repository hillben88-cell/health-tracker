// Conundrum — five nine-letter anagrams a day, easiest first. Tap the scrambled tiles into
// the answer row (or type); the word is checked once all nine letters are in.
import {
  h, dayData, toast, statRow, distribution, streaks, puzzleNo, confetti, ICON, onPhysicalKeys, fmtClock,
  flip, fadeIn, reduceMotion, EASE,
} from '../core.js';

const COUNT = 5;
const LEN = 9;
const MAX_HINTS = 4;
const LEVELS = ['Warm-up', 'Steady', 'Tricky', 'Tough', 'Fiendish'];
const HEADLINES = ['Fiendish today!', 'One cracked', 'Getting there', 'Nicely done', 'Sharp as a tack', 'All five!'];
const byKey = (el) => el.dataset.key;

const solvedCount = (r) => (r?.st || []).filter((s) => s === 'solved').length;

export default {
  id: 'conundrum',
  name: 'Conundrum',
  short: 'Conundrum',
  blurb: 'Five nine-letter anagrams to unscramble.',
  tagline: 'Five nine-letter words, scrambled. Each one has only one answer.',
  color: 'var(--conundrum)',
  tint: 'var(--conundrum-tint)',
  perfectLabel: 'All five, no hints',
  perfect: (r) => r.score === COUNT && !r.hintsUsed,

  load: (date) => dayData('conundrum', date),

  summary(r) {
    if (!r) return 'Five nine-letter anagrams';
    if (r.done) return `${r.score}/5 solved${r.time ? ` · ${fmtClock(r.time)}` : ''}`;
    return `${solvedCount(r)} of 5 solved`;
  },
  statsSummary(records) {
    const all = Object.values(records).filter((r) => r.done);
    const s = streaks(records, (r) => r.done);
    return [[all.length, 'Played'], [all.length ? (all.reduce((n, r) => n + r.score, 0) / all.length).toFixed(1) : '–', 'Average'], [s.current, 'Streak']];
  },
  stats(records, date) {
    const all = Object.values(records).filter((r) => r.done);
    const s = streaks(records, (r) => r.done);
    const today = date && records[date];
    const perfect = all.filter((r) => r.score === COUNT && !r.hintsUsed);
    const fastest = perfect.length ? fmtClock(Math.min(...perfect.map((r) => r.time || 0))) : '–';
    return h(
      'div',
      null,
      statRow([[all.length, 'Played'], [all.length ? (all.reduce((n, r) => n + r.score, 0) / all.length).toFixed(1) : '–', 'Average solved'], [perfect.length, 'Perfect days']]),
      statRow([[s.current, 'Current streak'], [s.max, 'Max streak'], [fastest, 'Fastest perfect']]),
      h('h3', { class: 'sub-head' }, 'Solved per day'),
      distribution([0, 1, 2, 3, 4, 5].map((n) => [n, all.filter((r) => r.score === n).length, today?.done && today.score === n])),
      h('p', { class: 'fine' }, 'Your streak counts the days you finish all five on the day.'),
    );
  },
  help() {
    return [
      h('p', null, 'Five nine-letter words a day, each with its letters scrambled. They start gentle and get harder.'),
      h('ul', null,
        h('li', null, 'Tap the letters (or type) to spell the word in the answer row. Tap a placed letter to send it back.'),
        h('li', null, 'Once all nine letters are in, your answer is checked.'),
        h('li', null, 'Each conundrum has exactly one answer.'),
        h('li', null, h('b', null, 'Hint'), ' locks in the next letter of the answer (up to four per word). ', h('b', null, 'Reveal'), ' gives up on a word.'),
        h('li', null, 'Skip between the five with the dots at the top. You can come back later; the clock pauses while you’re away.')),
      h('p', null, 'Solve all five without hints for a perfect day.'),
    ];
  },

  mount(ctx) {
    const p = ctx.data; // {w: [answers], s: [scrambles]}
    const r = ctx.rec || {};
    r.st ||= Array(COUNT).fill(''); // '' | 'solved' | 'revealed'
    r.hints ||= Array(COUNT).fill(0);
    r.placed ||= Array.from({ length: COUNT }, () => []); // tile indices in answer order
    r.order ||= Array.from({ length: COUNT }, () => [...Array(LEN).keys()]); // tile layout in the scramble row
    r.time ||= 0;
    let cur = r.done ? 0 : Math.max(0, r.st.findIndex((s) => !s));
    let busy = false;
    let confirmReveal = 0;

    const dots = h('div', { class: 'cn-dots', role: 'tablist', 'aria-label': 'Conundrums' });
    const meta = h('div', { class: 'cn-meta' });
    const clock = h('span', { class: `cn-clock ${ctx.settings.showTimer ? '' : 'hide'}` });
    const scrambleRow = h('div', { class: 'cn-row cn-scramble', 'aria-label': 'Scrambled letters' });
    const answerRow = h('div', { class: 'cn-row cn-answer', 'aria-label': 'Your answer' });
    const board = h('div', { class: 'cn-board' }, scrambleRow, h('div', { class: 'cn-arrow', html: ICON.chevR }), answerRow);
    const shuffleBtn = h('button', { class: 'btn ghost sm', onclick: shuffle }, 'Shuffle');
    const clearBtn = h('button', { class: 'btn ghost sm', onclick: clear }, 'Clear');
    const hintBtn = h('button', { class: 'btn ghost sm cn-hint', onclick: hint });
    const skipBtn = h('button', { class: 'btn ghost sm', onclick: () => move(nextOpen(cur), 1) }, 'Skip');
    const revealBtn = h('button', { class: 'btn ghost sm cn-reveal', onclick: reveal }, 'Reveal');
    const tools = h('div', { class: 'cn-tools' }, shuffleBtn, clearBtn, hintBtn);
    const tools2 = h('div', { class: 'cn-tools' }, skipBtn, revealBtn);
    const play = h('div', { class: 'cn-play' }, meta, board, tools, tools2);
    const summaryEl = h('div', { class: 'cn-summary' });
    ctx.root.append(h('div', { class: 'cn-wrap' }, dots, play, summaryEl));

    // ----- helpers
    const letters = (k) => p.s[k];
    const word = (k) => r.placed[k].map((ti) => letters(k)[ti]).join('');
    /** The scramble's tiles that spell the answer, in order. */
    function answerTiles(k) {
      const used = new Set();
      return [...p.w[k]].map((ch) => {
        const ti = [...letters(k)].findIndex((c, i) => c === ch && !used.has(i));
        used.add(ti);
        return ti;
      });
    }
    const nextOpen = (from) => {
      for (let d = 1; d <= COUNT; d++) if (!r.st[(from + d) % COUNT]) return (from + d) % COUNT;
      return from;
    };

    // ----- rendering
    function tile(k, ti, cls = '') {
      return h('button', { class: `cn-tile ${cls}`, 'data-key': ti, onclick: () => tap(ti), 'aria-label': letters(k)[ti].toUpperCase() }, letters(k)[ti].toUpperCase());
    }
    function render() {
      const k = cur;
      const st = r.st[k];
      const placed = r.placed[k];
      const locked = r.hints[k];
      dots.replaceChildren(
        ...p.w.map((_, i) =>
          h('button', {
            class: `cn-dot ${r.st[i] === 'solved' ? (r.hints[i] ? 'hinted' : 'solved') : r.st[i] || ''} ${i === k && !r.done ? 'cur' : ''}`,
            role: 'tab', 'aria-selected': i === k ? 'true' : 'false', 'aria-label': `Conundrum ${i + 1}${r.st[i] ? `, ${r.st[i]}` : ''}`, disabled: r.done || null,
            onclick: () => i !== cur && move(i, i > cur ? 1 : -1),
          }, i + 1),
        ),
      );
      clock.textContent = fmtClock(r.time);
      meta.replaceChildren(h('span', { class: 'cn-num' }, `Conundrum ${k + 1} of ${COUNT}`), h('span', { class: 'cn-level' }, LEVELS[k]), clock);
      scrambleRow.replaceChildren(...r.order[k].map((ti) => (placed.includes(ti) ? h('span', { class: 'cn-spot' }) : tile(k, ti))));
      const stateCls = st === 'solved' ? 'right' : st === 'revealed' ? 'shown' : '';
      answerRow.replaceChildren(
        ...Array.from({ length: LEN }, (_, j) => (placed[j] != null ? tile(k, placed[j], `${j < locked ? 'locked' : ''} ${stateCls}`) : h('span', { class: 'cn-slot' }))),
      );
      const open = !st && !r.done;
      shuffleBtn.disabled = !open;
      clearBtn.disabled = !open || placed.length <= locked;
      hintBtn.innerHTML = `${ICON.bulb}<span>Hint${r.hints[k] ? ` (${r.hints[k]})` : ''}</span>`;
      hintBtn.disabled = !open || r.hints[k] >= MAX_HINTS;
      skipBtn.disabled = !open || nextOpen(k) === k;
      revealBtn.disabled = !open;
      revealBtn.textContent = confirmReveal ? 'Tap again to reveal' : 'Reveal';
      revealBtn.classList.toggle('armed', !!confirmReveal);
    }
    // Every change moves tiles smoothly between the scramble and the answer row.
    const update = (mutate, duration = 240) => flip(board, '.cn-tile', () => { mutate?.(); render(); }, { key: byKey, duration });

    // ----- actions
    function tap(ti) {
      const k = cur;
      if (busy || r.st[k] || r.done) return;
      const placed = r.placed[k];
      const at = placed.indexOf(ti);
      if (at >= 0) {
        if (at < r.hints[k]) return; // hinted letters stay put
        update(() => placed.splice(at, 1));
      } else {
        if (placed.length >= LEN) return;
        update(() => placed.push(ti));
        if (placed.length === LEN) check();
      }
      ctx.save(r);
    }
    function back() {
      const k = cur;
      if (busy || r.st[k] || r.placed[k].length <= r.hints[k]) return;
      update(() => r.placed[k].pop());
      ctx.save(r);
    }
    function clear() {
      const k = cur;
      if (busy || r.st[k]) return;
      update(() => r.placed[k].splice(r.hints[k]));
      ctx.save(r);
    }
    function shuffle() {
      const k = cur;
      if (busy || r.st[k]) return;
      update(() => {
        const o = r.order[k];
        for (let i = o.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [o[i], o[j]] = [o[j], o[i]];
        }
      }, 380);
      ctx.save(r);
    }
    function hint() {
      const k = cur;
      if (busy || r.st[k] || r.hints[k] >= MAX_HINTS) return;
      r.hints[k]++;
      // Lock in the first letters of the answer; anything else you'd placed goes back.
      update(() => (r.placed[k] = answerTiles(k).slice(0, r.hints[k])), 320);
      toast(`Starts ${p.w[k].slice(0, r.hints[k]).toUpperCase()}…`);
      ctx.save(r);
    }
    function reveal() {
      const k = cur;
      if (busy || r.st[k]) return;
      if (!confirmReveal) {
        confirmReveal = setTimeout(() => { confirmReveal = 0; render(); }, 3000);
        return render();
      }
      clearTimeout(confirmReveal);
      confirmReveal = 0;
      r.st[k] = 'revealed';
      update(() => (r.placed[k] = answerTiles(k)), 420);
      ctx.save(r);
      after(k);
    }
    function check() {
      const k = cur;
      if (word(k) !== p.w[k]) {
        busy = true;
        setTimeout(() => {
          answerRow.classList.remove('shake');
          void answerRow.offsetWidth;
          answerRow.classList.add('shake');
          toast('Not quite');
          busy = false;
        }, 260);
        return;
      }
      r.st[k] = 'solved';
      busy = true;
      setTimeout(() => {
        render();
        celebrate();
        toast(r.hints[k] ? 'Solved!' : ['Splendid!', 'Bravo!', 'Cracked it!', 'Superb!', 'Brilliant!'][k]);
        ctx.save(r);
        after(k);
      }, 260);
    }
    // The answer's tiles turn over one after another as they go green.
    function celebrate() {
      if (reduceMotion()) return;
      [...answerRow.querySelectorAll('.cn-tile')].forEach((t, j) =>
        t.animate?.([{ transform: 'perspective(400px) rotateX(0)' }, { transform: 'perspective(400px) rotateX(-180deg) scale(1.06)', offset: 0.5 }, { transform: 'perspective(400px) rotateX(-360deg)' }], { duration: 520, delay: j * 55, easing: EASE }),
      );
    }
    // After a word is settled: on to the next open one, or the end of the game.
    function after(k) {
      const open = r.st.some((s) => !s);
      setTimeout(() => {
        busy = false;
        if (!ctx.alive()) return;
        if (open) move(nextOpen(k), 1);
        else finish();
      }, 1300);
    }
    function move(k, dir) {
      if (k === cur) return;
      cur = k;
      clearTimeout(confirmReveal);
      confirmReveal = 0;
      render();
      fadeIn(board, { dx: dir * 28, dy: 0, duration: 320 });
      fadeIn(meta, { dx: dir * 14, dy: 0, duration: 260 });
    }

    // ----- clock: runs while you're playing and the app is in view
    let timer = null;
    const tick = () => {
      r.time++;
      clock.textContent = fmtClock(r.time);
      if (r.time % 5 === 0) ctx.save(r);
    };
    const startClock = () => { if (!timer && !r.done && !document.hidden) timer = setInterval(tick, 1000); };
    const stopClock = () => { clearInterval(timer); timer = null; };
    const vis = () => (document.hidden ? stopClock() : startClock());
    document.addEventListener('visibilitychange', vis);

    // ----- finishing
    function shareText() {
      const sq = p.w.map((_, i) => (r.st[i] === 'solved' ? (r.hints[i] ? '🟨' : '🟩') : '⬛')).join('');
      return `Conundrum No. ${puzzleNo(ctx.date)}: ${r.score}/5${r.time ? ` · ${fmtClock(r.time)}` : ''}\n${sq}`;
    }
    function finish() {
      stopClock();
      r.score = solvedCount(r);
      r.hintsUsed = r.hints.reduce((a, b) => a + b, 0);
      r.win = r.score > 0;
      if (r.score === COUNT) confetti(['#C98A12', '#F3C14B', '#2F7A8C', '#FFFFFF']);
      ctx.finish(r, {
        headline: r.score === COUNT && !r.hintsUsed ? 'Perfect!' : HEADLINES[r.score],
        sub: `${r.score} of 5 solved${r.hintsUsed ? ` with ${r.hintsUsed} hint${r.hintsUsed === 1 ? '' : 's'}` : ''} in ${fmtClock(r.time)}.`,
        shareText: shareText(),
        delay: 500,
      });
      renderSummary();
      fadeIn(summaryEl, { dy: 12, duration: 380 });
    }
    function renderSummary() {
      play.hidden = true;
      summaryEl.hidden = false;
      render();
      summaryEl.replaceChildren(
        h('div', { class: 'cn-final' }, h('div', { class: 'cn-big' }, r.score, h('small', null, '/5')), h('div', { class: 'cn-time' }, fmtClock(r.time))),
        h('ol', { class: 'cn-list' },
          p.w.map((w, i) =>
            h('li', { class: r.st[i] === 'solved' ? (r.hints[i] ? 'hinted' : 'solved') : 'revealed' },
              h('span', { class: 'cn-scr' }, p.s[i].toUpperCase()),
              h('span', { class: 'cn-ans' }, w.toUpperCase()),
              h('small', null, r.st[i] === 'solved' ? (r.hints[i] ? `Solved with ${r.hints[i]} hint${r.hints[i] === 1 ? '' : 's'}` : 'Solved') : 'Revealed')),
          ),
        ),
      );
    }

    const off = onPhysicalKeys((key) => {
      if (r.done) return false;
      if (key === 'back') return back();
      if (key === 'ArrowRight') return move((cur + 1) % COUNT, 1);
      if (key === 'ArrowLeft') return move((cur + COUNT - 1) % COUNT, -1);
      if (/^[a-z]$/.test(key)) {
        const k = cur;
        const ti = r.order[k].find((i) => letters(k)[i] === key && !r.placed[k].includes(i));
        if (ti === undefined) return false;
        return tap(ti);
      }
      return false;
    }, ctx.alive);

    if (r.done) renderSummary();
    else {
      summaryEl.hidden = true;
      render();
      startClock();
    }
    return () => {
      stopClock();
      off();
      document.removeEventListener('visibilitychange', vis);
    };
  },
};
