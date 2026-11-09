// Pub Quiz: twenty multiple-choice questions a day, two from each category, easiest first.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT, rng, hash, shuffle } from './lib/util.mjs';

export const PER_CATEGORY = 2;

/** Parse content/pubquiz.txt: "## code | Category name" headers, then "difficulty | question | answer | wrong | wrong | wrong". */
export function loadQuiz() {
  const cats = {};
  const q = [];
  let cat = null;
  const problems = [];
  for (const raw of fs.readFileSync(path.join(CONTENT, 'pubquiz.txt'), 'utf8').split('\n')) {
    const line = raw.trim();
    const head = line.match(/^##\s*([a-z]+)\s*\|\s*(.+)$/);
    if (!line || (line.startsWith('#') && !head)) continue;
    if (head) {
      cat = head[1];
      cats[cat] = head[2].trim();
      continue;
    }
    const parts = line.split('|').map((s) => s.trim());
    if (!cat || parts.length !== 6) {
      problems.push(`Bad line: ${line}`);
      continue;
    }
    const [d, text, answer, ...wrong] = parts;
    const all = [answer, ...wrong].map((s) => s.toLowerCase());
    if (new Set(all).size !== 4 || !/^[123]$/.test(d)) {
      problems.push(`Duplicate options or bad difficulty: ${line}`);
      continue;
    }
    q.push([cat, +d, text, answer, ...wrong]);
  }
  if (problems.length) throw new Error('pubquiz.txt problems:\n' + problems.join('\n'));
  return { cats, q };
}

/** Arrange questions easiest first without two from the same category back to back. */
function arrange(items, rand) {
  const pool = shuffle(items, rand).sort((a, b) => a.diff - b.diff);
  const out = [];
  while (pool.length) {
    const last = out.at(-1)?.cat;
    // the easiest remaining question that isn't the same category as the previous one
    let k = pool.findIndex((x) => x.cat !== last);
    if (k < 0) k = 0;
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

export function genQuiz(N) {
  const bank = loadQuiz();
  const byCat = {};
  bank.q.forEach(([cat], id) => (byCat[cat] ||= []).push(id));
  const queues = {};
  const cycle = {};
  const take = (cat) => {
    if (!queues[cat]?.length) {
      cycle[cat] = (cycle[cat] || 0) + 1;
      queues[cat] = shuffle(byCat[cat], rng(hash(`quiz-${cat}`) + cycle[cat]));
    }
    return queues[cat].shift();
  };
  const days = [];
  for (let day = 0; day < N; day++) {
    const rand = rng(hash('quiz-day') + day * 2654435761);
    const picked = [];
    for (const cat of Object.keys(byCat)) for (let i = 0; i < PER_CATEGORY; i++) picked.push(take(cat));
    days.push(arrange(picked.map((id) => ({ id, cat: bank.q[id][0], diff: bank.q[id][1] })), rand).map((x) => x.id));
  }
  return { bank, days };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { bank, days } = genQuiz(+process.argv[2] || 3);
  const counts = {};
  bank.q.forEach(([c]) => (counts[c] = (counts[c] || 0) + 1));
  console.log('questions', bank.q.length, JSON.stringify(counts));
  for (const ids of days.slice(0, 1)) for (const id of ids) console.log(' ', bank.q[id][0].padEnd(6), bank.q[id][1], bank.q[id][2], '→', bank.q[id][3]);
}
