// Pub Quiz: twenty multiple-choice questions a day across ten categories, easiest first.
import { h, dayData, fetchJSON, hash, seeded, toast, clearToasts, statRow, distribution, streaks, puzzleNo, confetti, ICON } from '../core.js';

const COUNT = 20;
// Score bands and their titles, lowest first: [minimum score, title].
const RANKS = [
  [0, 'Wooden Spoon'],
  [5, 'Propping Up the Bar'],
  [9, 'Respectable Effort'],
  [12, 'Quiz Regular'],
  [15, 'Table of Champions'],
  [18, 'Brainbox'],
  [20, 'Perfect Pint'],
];
const rankOf = (score) => RANKS.filter(([min]) => score >= min).at(-1)[1];
const bandOf = (score) => RANKS.filter(([min]) => score >= min).length - 1;
const scoreOf = (r, qs) => (r?.answers || []).filter((a, i) => a != null && qs && a === qs[i].answer).length;

function shuffledOptions(date, id, q) {
  const opts = [q.answer, ...q.wrong];
  const rand = seeded(hash(`${date}#${id}`));
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

export default {
  id: 'quiz',
  name: 'Pub Quiz',
  short: 'Quiz',
  blurb: 'Twenty questions across ten categories.',
  tagline: 'Twenty classic pub quiz questions. No phones under the table.',
  color: 'var(--quiz)',
  tint: 'var(--quiz-tint)',
  perfectLabel: '18 or more',
  perfect: (r) => r.score >= 18,

  async load(date) {
    const [ids, bank] = await Promise.all([dayData('quiz', date), fetchJSON('data/quiz/bank.json')]);
    const questions = ids.map((id) => {
      const [cat, diff, text, answer, ...wrong] = bank.q[id];
      const q = { id, cat: bank.cats[cat] || cat, diff, text, answer, wrong };
      q.options = shuffledOptions(date, id, q);
      return q;
    });
    return { questions };
  },

  summary(r) {
    if (!r) return 'Twenty questions, ready when you are';
    if (r.done) return `${r.score}/20 · ${rankOf(r.score)}`;
    const answered = (r.answers || []).filter((a) => a != null).length;
    return `${answered} of 20 answered`;
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
    const avg = all.length ? (all.reduce((n, r) => n + r.score, 0) / all.length).toFixed(1) : '–';
    const best = all.length ? Math.max(...all.map((r) => r.score)) : '–';
    return h(
      'div',
      null,
      statRow([[all.length, 'Played'], [avg, 'Average score'], [best, 'Best score']]),
      statRow([[s.current, 'Current streak'], [s.max, 'Max streak']]),
      h('h3', { class: 'sub-head' }, 'Scores'),
      distribution(RANKS.map(([min], i) => {
        const max = i < RANKS.length - 1 ? RANKS[i + 1][0] - 1 : 20;
        return [min === max ? `${min}` : `${min}–${max}`, all.filter((r) => bandOf(r.score) === i).length, today?.done && bandOf(today.score) === i];
      })),
      h('p', { class: 'fine' }, 'Your streak counts the days you finish the quiz on the day.'),
    );
  },
  help() {
    return [
      h('p', null, 'Twenty classic pub quiz questions every day: two from each of ten rounds, from general knowledge to music, sport and food and drink. They start easy and get harder.'),
      h('ul', null,
        h('li', null, 'Tap the answer you think is right. You can’t change it once it’s in.'),
        h('li', null, 'You have one ', h('b', null, '50:50'), ' per quiz, which removes two wrong answers.'),
        h('li', null, 'You can leave and come back to finish later.')),
      h('p', null, h('b', null, 'Scoring: '), RANKS.map(([min, name], i) => `${name} ${min}${i < RANKS.length - 1 && RANKS[i + 1][0] - 1 > min ? `–${RANKS[i + 1][0] - 1}` : ''}`).join(' · '), '.'),
    ];
  },

  mount(ctx) {
    const qs = ctx.data.questions;
    const r = ctx.rec || { answers: Array(COUNT).fill(null), fifty: null };
    r.answers ||= Array(COUNT).fill(null);
    let cur = r.done ? COUNT : Math.max(0, r.answers.findIndex((a) => a == null));
    let revealed = false; // showing feedback for the current question

    const progress = h('div', { class: 'qz-progress', role: 'list', 'aria-label': 'Progress' });
    const meta = h('div', { class: 'qz-meta' });
    const card = h('div', { class: 'qz-card' });
    const opts = h('div', { class: 'qz-options' });
    const fiftyBtn = h('button', { class: 'btn ghost sm qz-fifty', onclick: useFifty }, '50:50');
    const nextBtn = h('button', { class: 'btn primary qz-next', onclick: next });
    const tools = h('div', { class: 'qz-tools' }, fiftyBtn, nextBtn);
    const play = h('div', { class: 'qz-play' }, meta, card, opts, tools);
    const summaryEl = h('div', { class: 'qz-summary' });
    ctx.root.append(h('div', { class: 'qz-wrap' }, progress, play, summaryEl));

    const score = () => scoreOf(r, qs);
    function renderProgress() {
      progress.replaceChildren(
        ...qs.map((q, i) => {
          const a = r.answers[i];
          const cls = a == null ? (i === cur ? 'cur' : '') : a === q.answer ? 'right' : 'wrong';
          return h('i', { class: cls, role: 'listitem', 'aria-label': `Question ${i + 1}${a == null ? '' : a === q.answer ? ', right' : ', wrong'}` });
        }),
      );
    }
    function renderQuestion() {
      const q = qs[cur];
      const a = r.answers[cur];
      revealed = a != null;
      meta.replaceChildren(h('span', { class: 'qz-num' }, `Question ${cur + 1} of ${COUNT}`), h('span', { class: 'qz-cat' }, q.cat), h('span', { class: 'qz-score' }, `Score ${score()}`));
      card.replaceChildren(h('p', { class: 'qz-q' }, q.text));
      const hidden = r.fifty === cur ? new Set(q.options.filter((o) => o !== q.answer).slice(0, 2)) : new Set();
      opts.replaceChildren(
        ...q.options.map((o, k) => {
          let cls = 'qz-opt';
          if (revealed) {
            if (o === q.answer) cls += ' right';
            else if (o === a) cls += ' wrong';
            else cls += ' dim';
          }
          if (hidden.has(o) && !revealed) cls += ' gone';
          return h('button', { class: cls, disabled: revealed || hidden.has(o) || null, onclick: () => answer(o) }, h('b', null, 'ABCD'[k]), h('span', null, o));
        }),
      );
      fiftyBtn.disabled = revealed || r.fifty != null;
      fiftyBtn.textContent = r.fifty != null ? '50:50 used' : '50:50';
      nextBtn.hidden = !revealed;
      nextBtn.textContent = cur === COUNT - 1 ? 'See your score' : 'Next question';
      renderProgress();
    }
    function answer(o) {
      if (revealed || r.done) return;
      r.answers[cur] = o;
      ctx.save(r);
      const right = o === qs[cur].answer;
      toast(right ? ['Correct!', 'Spot on!', 'Nailed it!', 'Get in!'][cur % 4] : 'Not quite');
      renderQuestion();
      nextBtn.focus?.();
    }
    function useFifty() {
      if (revealed || r.fifty != null) return;
      r.fifty = cur;
      ctx.save(r);
      renderQuestion();
    }
    function next() {
      if (cur < COUNT - 1) {
        cur++;
        renderQuestion();
        play.scrollIntoView?.({ block: 'start' });
        return;
      }
      finish();
    }
    function shareText() {
      const rows = [0, 1, 2, 3].map((k) => qs.slice(k * 5, k * 5 + 5).map((q, i) => (r.answers[k * 5 + i] === q.answer ? '🟩' : '🟥')).join('')).join('\n');
      return `Pub Quiz No. ${puzzleNo(ctx.date)}: ${r.score}/20, ${rankOf(r.score)}\n${rows}`;
    }
    function finish() {
      clearToasts();
      r.score = score();
      r.win = true;
      cur = COUNT;
      if (r.score >= 18) confetti();
      ctx.finish(r, { headline: rankOf(r.score), sub: `You scored ${r.score} out of 20.`, shareText: shareText(), delay: 500 });
      renderSummary();
    }
    function renderSummary() {
      play.hidden = true;
      summaryEl.hidden = false;
      renderProgress();
      const s = r.score ?? score();
      summaryEl.replaceChildren(
        h('div', { class: 'qz-final' }, h('div', { class: 'qz-big' }, s, h('small', null, '/20')), h('div', { class: 'qz-rank' }, rankOf(s))),
        h('h3', { class: 'sub-head' }, 'Answers'),
        h(
          'ol',
          { class: 'qz-review' },
          qs.map((q, i) => {
            const a = r.answers[i];
            const right = a === q.answer;
            return h('li', { class: right ? 'right' : 'wrong' },
              h('span', { class: 'qz-mark', html: right ? ICON.check : ICON.close }),
              h('div', null, h('small', null, q.cat), h('p', null, q.text), h('p', { class: 'qz-ans' }, right ? h('b', null, q.answer) : [h('s', null, a ?? 'No answer'), ' ', h('b', null, q.answer)])));
          }),
        ),
      );
    }
    if (r.done) renderSummary();
    else {
      summaryEl.hidden = true;
      renderQuestion();
    }
    return () => {};
  },
};
