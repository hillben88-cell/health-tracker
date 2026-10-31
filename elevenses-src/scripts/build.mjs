// Build every Elevenses puzzle from EPOCH to END into public/elevenses/data.
//   node elevenses-src/scripts/build.mjs            (everything)
//   node elevenses-src/scripts/build.mjs quartets   (just one game: inkling|spokes|quartets|ramble|crossword|dict)
import fs from 'node:fs';
import path from 'node:path';
import { EPOCH, END, OUT, dayCount, dateOf, writeJSON } from './lib/util.mjs';
import { genInkling, genSpokes, buildDictionary } from './gen-words.mjs';
import { genQuartets } from './gen-quartets.mjs';
import { genRamble } from './gen-ramble.mjs';
import { genCrosswords } from './gen-crossword.mjs';

const N = dayCount();
const only = process.argv[2];
const want = (g) => !only || only === g;

/** Split a per-day array into data/<game>/<year>.json files of {first, days}. */
function writeByYear(game, days, extra = {}) {
  const dir = path.join(OUT, game);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const years = new Map();
  days.forEach((d, i) => {
    const date = dateOf(i);
    const y = date.slice(0, 4);
    if (!years.has(y)) years.set(y, { first: date, days: [] });
    years.get(y).days.push(d);
  });
  let total = 0;
  for (const [y, obj] of years) total += writeJSON(`${game}/${y}.json`, { ...obj, ...extra });
  console.log(`  ${game}: ${days.length} days, ${(total / 1024).toFixed(0)} KB in ${years.size} files`);
}

console.log(`Elevenses build: ${EPOCH} → ${END} (${N} days)`);
fs.mkdirSync(OUT, { recursive: true });
writeJSON('meta.json', { epoch: EPOCH, end: END, built: new Date().toISOString().slice(0, 10) });

if (want('dict')) {
  const words = buildDictionary();
  fs.writeFileSync(path.join(OUT, 'words.txt'), words.filter((w) => w.length <= 10).join('\n'));
  fs.writeFileSync(path.join(OUT, 'words5.txt'), words.filter((w) => w.length === 5).join('\n'));
  console.log(`  dictionary: ${words.length} words`);
}
if (want('inkling')) writeByYear('inkling', genInkling(N));
if (want('spokes')) writeByYear('spokes', genSpokes(N));
if (want('quartets')) writeByYear('quartets', genQuartets(N));
if (want('ramble')) {
  const { themes, days } = genRamble(N);
  writeByYear('ramble', days.map((d) => ({ n: themes[d.t].n, c: themes[d.t].c, g: d.g, w: d.w, p: d.p })));
}
if (want('crossword')) {
  const { mini, midi, clues } = genCrosswords(N, { log: console.log });
  writeByYear('mini', mini);
  writeByYear('midi', midi);
  console.log(`  clues: ${Object.keys(clues).length} words, ${(writeJSON('clues.json', clues) / 1024).toFixed(0)} KB`);
}
if (only === 'clues') {
  // Re-export clue text for the existing grids (edit clues without changing any puzzle).
  const { loadClues, slotsOf } = await import('./lib/crossword.mjs');
  const bank = loadClues();
  const used = new Set();
  for (const [game, size] of [['mini', 5], ['midi', 9]]) {
    for (const f of fs.readdirSync(path.join(OUT, game))) {
      for (const flat of JSON.parse(fs.readFileSync(path.join(OUT, game, f), 'utf8')).days) {
        const rows = Array.from({ length: size }, (_, r) => flat.slice(r * size, r * size + size));
        for (const s of slotsOf(rows)) used.add(s.cells.map((i) => flat[i]).join(''));
      }
    }
  }
  const clues = {};
  for (const w of [...used].sort()) {
    if (!bank.has(w)) throw new Error(`No clue for "${w}" — it is used in a grid, so keep at least one clue for it.`);
    clues[w] = bank.get(w);
  }
  console.log(`  clues: ${used.size} words, ${(writeJSON('clues.json', clues) / 1024).toFixed(0)} KB`);
}
console.log('Done.');
