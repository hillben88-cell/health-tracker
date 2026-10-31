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

/** Words that count in Spokes: common-ish, no plurals in -s, no blocked words. */
function spokesVocab() {
  const lex = lexicon();
  const block = blocklist();
  const vocab = [];
  for (const [w, { level, zipf }] of lex) {
    if (w.length < 4 || w.length > 9) continue;
    if (!((level <= 35 && zipf >= 2.4) || (level <= 50 && zipf >= 3.0))) continue;
    if (block.has(w) || isPluralS(w, lex)) continue;
    vocab.push(w);
  }
  return vocab;
}

const counts = (w) => {
  const c = new Array(26).fill(0);
  for (const ch of w) c[ch.charCodeAt(0) - 97]++;
  return c;
};
const fits = (wc, pc) => wc.every((n, i) => n <= pc[i]);

export function genSpokes(N) {
  const lex = lexicon();
  const vocab = spokesVocab();
  const vc = vocab.map((w) => [w, counts(w)]);
  const block = blocklist();
  // Candidate nine-letter key words: well known, not plural, not -ing/-ed heavy.
  const keys = vocab.filter((w) => w.length === 9 && lex.get(w).zipf >= 3.1 && lex.get(w).level <= 35 && !block.has(w) && !/(ed|ing)$/.test(w));
  const order = shuffle(keys, rng(hash('spokes')));
  const out = [];
  const usedLetterSets = new Set();
  let k = 0;
  for (let day = 0; day < N; day++) {
    const rand = rng(hash('spokes-day') + day);
    let puzzle = null;
    for (let tries = 0; tries < 400 && !puzzle; tries++) {
      const key = order[k++ % order.length];
      const sorted = key.split('').sort().join('');
      if (usedLetterSets.has(sorted) && k < order.length) continue;
      const pc = counts(key);
      const within = vc.filter(([, c]) => fits(c, pc)).map(([w]) => w);
      // Choose the centre letter to give a satisfying word count.
      const letters = [...new Set(key.split(''))];
      const options = letters
        .map((ch) => ({ ch, words: within.filter((w) => w.includes(ch)) }))
        .filter((o) => o.words.length >= 18 && o.words.length <= 70 && o.ch !== 's');
      if (!options.length) continue;
      const opt = options[Math.floor(rand() * options.length)];
      usedLetterSets.add(sorted);
      // Outer ring: remaining 8 letters in a shuffled order.
      const rest = key.split('');
      rest.splice(rest.indexOf(opt.ch), 1);
      const nines = opt.words.filter((w) => w.length === 9);
      puzzle = { c: opt.ch, o: shuffle(rest, rand).join(''), w: opt.words.sort(), n: nines };
    }
    if (!puzzle) throw new Error('Spokes: ran out of key words at day ' + day);
    out.push(puzzle);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = dayCount();
  const s = genSpokes(N); const lens=s.map(p=>p.w.length); console.log('spokes days',s.length,'min',Math.min(...lens),'max',Math.max(...lens));
  for (const p of s.slice(0, 5)) console.log(p.c, p.o, p.w.length, p.n.join(','), p.w.slice(0, 25).join(' '));
  console.log(genInkling(N).slice(0, 20).join(' '), buildDictionary().length);
}
