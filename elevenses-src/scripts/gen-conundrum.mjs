// Conundrum: five nine-letter anagrams a day, easiest first. Every answer is the only
// nine-letter word its letters make, and the scramble never gives away a run of the answer.
import { lexicon, blocklist, rng, hash, shuffle } from './lib/util.mjs';

export const PER_DAY = 5;
const sig = (w) => [...w].sort().join('');

function isPlural(w, lex) {
  return w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') &&
    (lex.has(w.slice(0, -1)) || (w.endsWith('es') && lex.has(w.slice(0, -2))) || (w.endsWith('ies') && lex.has(w.slice(0, -3) + 'y')));
}

/** Familiar nine-letter words (British spellings) with exactly one anagram, commonest first. */
export function conundrumWords() {
  const lex = lexicon();
  const block = blocklist();
  const count = new Map();
  for (const [w, { level }] of lex) if (w.length === 9 && /^[a-z]+$/.test(w) && level <= 70) count.set(sig(w), (count.get(sig(w)) || 0) + 1);
  const out = [];
  for (const [w, { level, zipf }] of lex) {
    if (w.length !== 9 || !/^[a-z]+$/.test(w) || level > 50 || zipf < 2.3) continue;
    if (block.has(w) || isPlural(w, lex) || count.get(sig(w)) !== 1) continue;
    out.push({ w, zipf });
  }
  return out.sort((a, b) => b.zipf - a.zipf || (a.w < b.w ? -1 : 1));
}

/** Scramble so no three letters of the answer stay together in order and it doesn't start the same way. */
export function scramble(word, rand, words) {
  const runs = new Set();
  for (let i = 0; i + 3 <= word.length; i++) runs.add(word.slice(i, i + 3));
  let best = null;
  for (let tries = 0; tries < 400; tries++) {
    const s = shuffle([...word], rand).join('');
    if (s === word || words.has(s) || s[0] === word[0]) continue;
    let kept = 0;
    for (let i = 0; i + 2 <= s.length; i++) if (word.includes(s.slice(i, i + 2))) kept++;
    if ([...runs].some((r) => s.includes(r))) continue;
    if (!best || kept < best.kept) best = { s, kept };
    if (kept <= 1) break;
  }
  return best.s;
}

export function genConundrum(N) {
  const pool = conundrumWords();
  const all = new Set(pool.map((x) => x.w));
  // Five difficulty bands by how common the word is; each day takes one from each, easiest first.
  const bands = Array.from({ length: PER_DAY }, (_, b) => pool.slice(Math.floor((b * pool.length) / PER_DAY), Math.floor(((b + 1) * pool.length) / PER_DAY)).map((x) => x.w));
  const queues = bands.map(() => []);
  const cycles = bands.map(() => 0);
  const take = (b, ok) => {
    for (let guard = 0; guard < 4; guard++) {
      if (!queues[b].length) queues[b] = shuffle(bands[b], rng(hash(`conundrum-${b}`) + cycles[b]++));
      const k = queues[b].findIndex(ok);
      if (k >= 0) return queues[b].splice(k, 1)[0];
      queues[b] = [];
    }
    return queues[b].shift();
  };
  const days = [];
  for (let day = 0; day < N; day++) {
    const rand = rng(hash('conundrum-day') + day * 7919);
    const picked = [];
    // At most one -ING and one -ED word a day, so the endings don't give too much away.
    const ending = (w) => (w.endsWith('ing') ? 'ing' : w.endsWith('ed') ? 'ed' : '');
    for (let b = 0; b < PER_DAY; b++) picked.push(take(b, (w) => !ending(w) || !picked.some((p) => ending(p) === ending(w))));
    days.push({ w: picked, s: picked.map((w) => scramble(w, rand, all)) });
  }
  return { days, pool: pool.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { days, pool } = genConundrum(+process.argv[2] || 5);
  console.log('pool', pool);
  for (const d of days) console.log(d.w.map((w, i) => `${d.s[i].toUpperCase()} → ${w}`).join('  |  '));
}
