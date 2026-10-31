// Mini (5x5) and Midi (9x9 British-style) crossword generators.
import { rng, hash } from './lib/util.mjs';
import { loadClues, loadMiniClues, crosswordIndex, fill, miniTemplates, randomLattice, slotsOf } from './lib/crossword.mjs';

function recentSet(lastUsed, day, window) {
  const s = new Set();
  for (const [w, d] of lastUsed) if (day - d < window) s.add(w);
  return s;
}

export function genCrosswords(N, { log = () => {} } = {}) {
  const bank = loadClues();
  const miniClues = loadMiniClues();
  // The Mini strongly prefers words that have a tricky clue, so most entries get one.
  const miniIdx = crosswordIndex(bank, [3, 4, 5], miniClues, 6);
  // Weak fill that makes a Mini feel flat: only used when nothing else fits.
  const MINI_WEAK = 'dos yea pap deb meg ifs ups ahs has doer newer wider ell ism pol nth eta ems ids abs ads ins hes sis mas tho yep yup huh duh meh oho pis hos'.split(' ');
  for (const w of MINI_WEAK) if (miniIdx.score.has(w)) miniIdx.score.set(w, miniIdx.score.get(w) - 6);
  const midiIdx = crosswordIndex(bank, [3, 4, 5, 6, 7, 8, 9]);
  // Mini templates that fill reliably, weighted towards the more open shapes.
  const tpls = miniTemplates().filter((t) => {
    const blocks = t.join('').split('#').length - 1;
    return blocks >= 2 || t.join('').includes('.#.#.');
  });
  const mini = [], midi = [];
  const lastMini = new Map(), lastMidi = new Map();
  const used = new Set();
  const usedMini = new Set();
  const t0 = Date.now();
  for (let day = 0; day < N; day++) {
    // ---- Mini
    const r1 = rng(hash('mini') + day * 31337);
    let g = null;
    for (let a = 0; a < 40 && !g; a++) {
      const tpl = tpls[Math.floor(r1() * tpls.length)];
      const avoid = recentSet(lastMini, day, a < 20 ? 21 : 7);
      g = fill(tpl, miniIdx, r1, { avoid, maxNodes: 15000, breadth: 40 });
    }
    if (!g) throw new Error('Mini failed on day ' + day);
    const flat = g.join('');
    for (const s of slotsOf(g)) {
      const w = s.cells.map((i) => flat[i]).join('');
      lastMini.set(w, day);
      used.add(w);
      usedMini.add(w);
    }
    mini.push(flat);

    // ---- Midi
    const r2 = rng(hash('midi') + day * 7907);
    let m = null;
    for (let a = 0; a < 60 && !m; a++) {
      const tpl = randomLattice(r2);
      const avoid = recentSet(lastMidi, day, a < 30 ? 30 : 10);
      m = fill(tpl, midiIdx, r2, { avoid, maxNodes: 6000, breadth: 30 });
    }
    if (!m) throw new Error('Midi failed on day ' + day);
    const mflat = m.join('');
    for (const s of slotsOf(m)) {
      const w = s.cells.map((i) => mflat[i]).join('');
      lastMidi.set(w, day);
      used.add(w);
    }
    midi.push(mflat);
    if (day % 100 === 0) log(`  crosswords: day ${day}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const clues = {};
  for (const w of [...used].sort()) clues[w] = bank.get(w);
  const cluesMini = {};
  for (const w of [...usedMini].sort()) if (miniClues.has(w)) cluesMini[w] = miniClues.get(w);
  return { mini, midi, clues, cluesMini };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = +process.argv[2] || 20;
  const t0 = Date.now();
  const { mini, midi, clues, cluesMini } = genCrosswords(n, { log: console.log });
  console.log('ms', Date.now() - t0, 'clued words used', Object.keys(clues).length, '| mini words with tricky clues', Object.keys(cluesMini).length);
  const show = (flat, size) => { for (let i = 0; i < size; i++) console.log('  ' + flat.slice(i * size, i * size + size).split('').join(' ')); console.log(); };
  show(mini[0], 5); show(mini[1], 5); show(midi[0], 9);
}
