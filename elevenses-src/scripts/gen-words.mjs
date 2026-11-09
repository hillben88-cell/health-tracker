// Inkling (five-letter word guess) and Spokes (nine-letter word wheel) generators,
// plus the shared dictionary the app uses to validate guesses.
import { lexicon, readLines, blocklist, rng, hash, shuffle, dayCount } from './lib/util.mjs';

const isPluralS = (w, lex) =>
  w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') &&
  (lex.has(w.slice(0, -1)) || (w.endsWith('es') && lex.has(w.slice(0, -2))) || (w.endsWith('ies') && lex.has(w.slice(0, -3) + 'y')));

/** Validation dictionary: everything SCOWL <= 60, 4-12 letters (5-letter guesses come from here too). */
export function buildDictionary() {
  const lex = lexicon();
  const block = blocklist();
  const words = [];
  for (const [w, { level }] of lex) if (level <= 60 && w.length >= 4 && w.length <= 12 && !block.has(w)) words.push(w);
  for (const w of readLines('inkling-answers.txt').map((s) => s.trim())) if (!lex.has(w) && w.length === 5) words.push(w);
  words.sort();
  return words;
}

export function genInkling(N) {
  const answers = [...new Set(readLines('inkling-answers.txt').map((s) => s.trim().toLowerCase()).filter((w) => /^[a-z]{5}$/.test(w)))];
  const block = blocklist();
  const pool = answers.filter((w) => !block.has(w));
  // Deterministic order; cycle with a fresh shuffle if we run out.
  const out = [];
  let round = 0;
  while (out.length < N) {
    out.push(...shuffle(pool, rng(hash('inkling') + round++)));
  }
  return out.slice(0, N);
}

/** Words that count in Spokes: common-ish, 4+ letters, no blocked words. (Letter sets never include S.) */
function spokesVocab() {
  const lex = lexicon();
  const block = blocklist();
  const vocab = [];
  for (const [w, { level, zipf }] of lex) {
    if (w.length < 4 || w.includes('s')) continue;
    if (!((level <= 35 && zipf >= 2.4) || (level <= 50 && zipf >= 3.0))) continue;
    if (block.has(w)) continue;
    vocab.push(w);
  }
  return vocab;
}

/**
 * The words each puzzle counts (towards ranks, hints and Hors Catégorie): broader than the
 * vocabulary used to choose the letters, so everyday words and their inflections count.
 */
function spokesCounted(level, zipf) {
  return (level <= 35 && zipf >= 1.5) || (level <= 50 && zipf >= 2.0) || (level <= 60 && zipf >= 2.8);
}
/** Everything else in the dictionary that fits is still accepted, as a bonus word. */
function spokesLists() {
  const lex = lexicon();
  const block = blocklist();
  const counted = [];
  const bonus = [];
  for (const [w, { level, zipf }] of lex) {
    if (w.length < 4 || w.includes('s') || level > 60 || block.has(w)) continue;
    (spokesCounted(level, zipf) ? counted : bonus).push({ w, m: letterMask(w) });
  }
  return { counted, bonus };
}

const letterMask = (w) => {
  let m = 0;
  for (const ch of w) m |= 1 << (ch.charCodeAt(0) - 97);
  return m;
};
const bits = (m) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};

/**
 * Spokes: seven letters (a hub plus six around it). Letters can be reused; every word must
 * use the hub; each puzzle has at least one "Full Circle" word that uses all seven letters.
 */
export function genSpokes(N) {
  const lex = lexicon();
  const vocab = spokesVocab().map((w) => ({ w, m: letterMask(w) }));
  // Seeds for the letter sets: well-known words with exactly seven distinct letters.
  const seeds = vocab.filter(({ w, m }) => bits(m) === 7 && lex.get(w).zipf >= 3.0 && lex.get(w).level <= 35);
  const order = shuffle(seeds, rng(hash('spokes7')));
  const lists = spokesLists();
  const out = [];
  const usedSets = new Set();
  let k = 0;
  for (let day = 0; day < N; day++) {
    const rand = rng(hash('spokes7-day') + day);
    let puzzle = null;
    for (let tries = 0; tries < 2000 && !puzzle; tries++) {
      const seed = order[k++ % order.length];
      if (usedSets.has(seed.m) && k < order.length * 2) continue;
      const within = vocab.filter((v) => (v.m & ~seed.m) === 0);
      const letters = [...new Set(seed.w)];
      const options = letters
        .map((ch) => {
          const bit = 1 << (ch.charCodeAt(0) - 97);
          return { ch, words: within.filter((v) => v.m & bit).map((v) => v.w) };
        })
        .filter((o) => o.words.length >= 20 && o.words.length <= 75);
      if (!options.length) continue;
      const opt = options[Math.floor(rand() * options.length)];
      usedSets.add(seed.m);
      const outer = letters.filter((ch) => ch !== opt.ch);
      const full = opt.words.filter((w) => letterMask(w) === seed.m);
      puzzle = { c: opt.ch, o: shuffle(outer, rand).join(''), w: opt.words.sort(), n: full.sort() };
      // The letters are chosen exactly as before (so existing puzzles don't change); the word
      // lists then come from the broader vocabulary: w counts, x is accepted as a bonus.
      const hubBit = 1 << (opt.ch.charCodeAt(0) - 97);
      const fits = (v) => (v.m & ~seed.m) === 0 && (v.m & hubBit) !== 0;
      puzzle.w = lists.counted.filter(fits).map((v) => v.w).sort();
      puzzle.x = lists.bonus.filter(fits).map((v) => v.w).sort();
      puzzle.n = puzzle.w.filter((w) => letterMask(w) === seed.m);
    }
    if (!puzzle) throw new Error('Spokes: ran out of letter sets at day ' + day);
    out.push(puzzle);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = dayCount();
  const s = genSpokes(N); const lens=s.map(p=>p.w.length); console.log('spokes days',s.length,'min',Math.min(...lens),'max',Math.max(...lens));
  console.log('unique letter sets', new Set(s.map((p) => [...(p.c + p.o)].sort().join(''))).size, 'min full circles', Math.min(...s.map((p) => p.n.length)));
  for (const p of s.slice(0, 5)) console.log(p.c, p.o, p.w.length, p.n.join(','), p.w.slice(0, 30).join(' '));
  console.log(genInkling(N).slice(0, 20).join(' '), buildDictionary().length);
}
