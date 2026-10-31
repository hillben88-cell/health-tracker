// Inkling — crack the five-letter word in six goes.
import { h, dayData, wordSet, keyboard, onPhysicalKeys, toast, statRow, distribution, streaks, puzzleNo, confetti } from '../core.js';

const ROWS = 6, LEN = 5;
const PRAISE = ['Unbelievable!', 'Brilliant!', 'Smashing!', 'Lovely stuff', 'Phew!', 'By a whisker!'];

export function evaluate(guess, answer) {
  const res = Array(LEN).fill('absent');
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (res[i] === 'correct') continue;
    if (left[guess[i]]) {
      res[i] = 'present';
      left[guess[i]]--;
    }
  }
  return res;
}

function hardModeError(guess, prev, answer) {
  for (const g of prev) {
    const ev = evaluate(g, answer);
    for (let i = 0; i < LEN; i++) {
      if (ev[i] === 'correct' && guess[i] !== g[i]) return `${ordinal(i + 1)} letter must be ${g[i].toUpperCase()}`;
    }
    const need = {};
    ev.forEach((e, i) => e !== 'absent' && (need[g[i]] = (need[g[i]] || 0) + 1));
    for (const [ch, n] of Object.entries(need)) if (guess.split(ch).length - 1 < n) return `Guess must contain ${ch.toUpperCase()}`;
  }
  return null;
}
const ordinal = (n) => ['1st', '2nd', '3rd', '4th', '5th'][n - 1];

export default {
  id: 'inkling',
  name: 'Inkling',
  short: 'Inkling',
  blurb: 'Crack the five-letter word in six goes.',
  tagline: 'Got an inkling? You have six goes to find the hidden five-letter word.',
  color: 'var(--inkling)',
  tint: 'var(--inkling-tint)',
  perfectLabel: 'In three or fewer',
  perfect: (r) => r.win && r.guesses.length <= 3,

  async load(date) {
    const [answer, words] = await Promise.all([dayData('inkling', date), wordSet('words5.txt')]);
    return { answer, words };
  },

  summary(r) {
    if (!r) return 'A new word is waiting';
    if (r.done) return r.win ? `Cracked in ${r.guesses.length}/6` : 'Not this time — X/6';
    return `${r.guesses.length} of 6 goes used`;
  },

  statsSummary(records) {
    const all = Object.values(records).filter((r) => r.done);
    const wins = all.filter((r) => r.win).length;
    const s = streaks(records, (r) => r.win);
    return [[all.length, 'Played'], [all.length ? Math.round((wins / all.length) * 100) + '%' : '–', 'Win %'], [s.current, 'Streak']];
  },

  stats(records, date) {
    const all = Object.values(records).filter((r) => r.done);
    const wins = all.filter((r) => r.win);
    const s = streaks(records, (r) => r.win);
    const distRows = [1, 2, 3, 4, 5, 6].map((n) => [n, wins.filter((r) => r.guesses.length === n).length, date && records[date]?.win && records[date].guesses.length === n]);
    return h(
      'div',
      null,
      statRow([[all.length, 'Played'], [all.length ? Math.round((wins.length / all.length) * 100) : 0, 'Win %'], [s.current, 'Current streak'], [s.max, 'Max streak']]),
      h('h3', { class: 'sub-head' }, 'Guess distribution'),
      distribution(distRows),
    );
  },

  help() {
    const ex = (word, marks, note) =>
      h('div', { class: 'help-ex' }, h('div', { class: 'ink-row sm' }, word.split('').map((ch, i) => h('div', { class: `ink-tile ${marks[i] || ''} filled` }, ch))), h('p', null, note));
    return [
      h('p', null, 'Guess the hidden word in six goes. Each guess must be a real five-letter word — British spellings welcome.'),
      h('p', null, 'After each guess, the tiles change colour to show how close you are.'),
      ex('CRUMB', ['correct'], h('span', null, h('b', null, 'C'), ' is in the word and in the right spot.')),
      ex('SCONE', ['', '', 'present'], h('span', null, h('b', null, 'O'), ' is in the word but in a different spot.')),
      ex('TOAST', ['', '', '', 'absent'], h('span', null, h('b', null, 'S'), ' isn’t in the word at all.')),
      h('p', null, 'Turn on hard mode in Settings if you fancy a sterner test. A new Inkling arrives every midnight.'),
    ];
  },

  mount(ctx) {
    const { answer, words } = ctx.data;
    const r = ctx.rec || { guesses: [], done: false };
    let current = '';
    let busy = false;
    const hard = ctx.settings.inklingHard;

    const tiles = [];
    const rows = [];
    const board = h(
      'div',
      { class: 'ink-board', role: 'grid', 'aria-label': 'Guesses' },
      Array.from({ length: ROWS }, (_, ri) => {
        const row = h('div', { class: 'ink-row', role: 'row' });
        tiles[ri] = Array.from({ length: LEN }, () => row.appendChild(h('div', { class: 'ink-tile', role: 'gridcell' })));
        rows.push(row);
        return row;
      }),
    );
    const kb = keyboard(onKey);
    ctx.root.append(h('div', { class: 'ink-wrap' }, board), kb.el);

    function paintKeys() {
      const best = {};
      const rank = { absent: 1, present: 2, correct: 3 };
      for (const g of r.guesses) {
        evaluate(g, answer).forEach((e, i) => {
          if (!best[g[i]] || rank[e] > rank[best[g[i]]]) best[g[i]] = e;
        });
      }
      for (const [ch, el] of Object.entries(kb.keys)) el.className = `kb-key ${best[ch] || ''}`;
    }
    function paintRow(ri, word, marks, animate) {
      tiles[ri].forEach((t, i) => {
        t.textContent = word[i] || '';
        t.classList.toggle('filled', !!word[i]);
        if (!marks) return;
        if (animate) {
          setTimeout(() => t.classList.add('flip'), i * 280);
          setTimeout(() => t.classList.add(marks[i]), i * 280 + 160);
        } else t.classList.add(marks[i]);
      });
    }
    r.guesses.forEach((g, i) => paintRow(i, g, evaluate(g, answer), false));
    paintKeys();
    if (r.done && !r.win) toast(answer.toUpperCase(), { ms: 2600 });

    function shake() {
      const row = rows[r.guesses.length];
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
    }
    function finishUp(win) {
      ctx.finish(r, {
        headline: win ? PRAISE[r.guesses.length - 1] : 'So close',
        sub: win ? `You found it in ${r.guesses.length}.` : `The word was ${answer.toUpperCase()}.`,
        shareText: shareText(),
        delay: 1900,
      });
      if (win) {
        setTimeout(() => {
          tiles[r.guesses.length - 1].forEach((t, i) => setTimeout(() => t.classList.add('bounce'), i * 90));
          confetti();
        }, 1500);
      }
    }
    function shareText() {
      const icon = { correct: '🟩', present: '🟧', absent: '⬜' };
      const grid = r.guesses.map((g) => evaluate(g, answer).map((e) => icon[e]).join('')).join('\n');
      return `Inkling No. ${puzzleNo(ctx.date)} ${r.win ? r.guesses.length : 'X'}/6${hard ? '*' : ''}\n\n${grid}`;
    }
    function submit() {
      if (current.length < LEN) {
        shake();
        return toast('Not enough letters');
      }
      if (!words.has(current) && current !== answer) {
        shake();
        return toast('Not in our word list');
      }
      if (hard) {
        const err = hardModeError(current, r.guesses, answer);
        if (err) {
          shake();
          return toast(err);
        }
      }
      const ri = r.guesses.length;
      const marks = evaluate(current, answer);
      r.guesses.push(current);
      const word = current;
      current = '';
      busy = true;
      paintRow(ri, word, marks, true);
      setTimeout(() => {
        busy = false;
        paintKeys();
      }, LEN * 280 + 200);
      const win = word === answer;
      if (win || r.guesses.length === ROWS) {
        r.win = win;
        if (!win) setTimeout(() => toast(answer.toUpperCase(), { ms: 3000 }), LEN * 280 + 200);
        else setTimeout(() => toast(PRAISE[r.guesses.length - 1]), LEN * 280 + 300);
        finishUp(win);
      } else ctx.save(r);
    }
    function onKey(k) {
      if (r.done || busy) return;
      if (k === 'enter') return submit();
      if (k === 'back') {
        current = current.slice(0, -1);
      } else if (/^[a-z]$/.test(k) && current.length < LEN) {
        current += k;
        const t = tiles[r.guesses.length][current.length - 1];
        t.classList.remove('pop');
        void t.offsetWidth;
        t.classList.add('pop');
      } else return false;
      paintRow(r.guesses.length, current, null, false);
    }
    const off = onPhysicalKeys(onKey, ctx.alive);
    return () => off();
  },
};
