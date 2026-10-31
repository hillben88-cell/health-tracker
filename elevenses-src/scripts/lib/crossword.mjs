// Crossword grid filling for the Mini (5x5, fully checked) and Midi (9x9 British lattice).
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT, lexicon, shuffle, pick } from './util.mjs';

function readClueFiles(files) {
  const bank = new Map();
  for (const f of files) {
    for (const raw of fs.readFileSync(path.join(CONTENT, f), 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([a-z]+)\s*=\s*(.+)$/i);
      if (!m) continue;
      const word = m[1].toLowerCase();
      const clues = m[2].split('|').map((c) => c.trim()).filter(Boolean);
      const list = bank.get(word) || [];
      for (const c of clues) if (!list.includes(c)) list.push(c);
      bank.set(word, list);
    }
  }
  return bank;
}

/** The main clue bank: every content/clues-*.txt except the Mini's tricky clues. Map(word -> [clues]). */
export function loadClues() {
  return readClueFiles(fs.readdirSync(CONTENT).filter((f) => /^clues-.*\.txt$/.test(f) && !/^clues-mini/.test(f)).sort());
}

/** Trickier clues used by the Mini (content/clues-mini*.txt). Map(word -> [clues]). */
export function loadMiniClues() {
  return readClueFiles(fs.readdirSync(CONTENT).filter((f) => /^clues-mini.*\.txt$/.test(f)).sort());
}

/** Maximal runs of white cells (length >= 2) in a template (array of strings, '#' = block). */
export function slotsOf(tpl) {
  const R = tpl.length, C = tpl[0].length, out = [];
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      if (tpl[r][c] === '#') { c++; continue; }
      const s = c;
      while (c < C && tpl[r][c] !== '#') c++;
      if (c - s >= 2) out.push({ dir: 'A', cells: Array.from({ length: c - s }, (_, i) => r * C + s + i) });
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      if (tpl[r][c] === '#') { r++; continue; }
      const s = r;
      while (r < R && tpl[r][c] !== '#') r++;
      if (r - s >= 2) out.push({ dir: 'D', cells: Array.from({ length: r - s }, (_, i) => (s + i) * C + c) });
    }
  }
  return out;
}

/** Word index: per length, bitsets for (position, letter). */
export class WordIndex {
  constructor(words, score) {
    this.byLen = new Map();
    for (const w of words) {
      if (!this.byLen.has(w.length)) this.byLen.set(w.length, []);
      this.byLen.get(w.length).push(w);
    }
    this.bits = new Map();
    this.score = score;
    for (const [L, list] of this.byLen) {
      const n = Math.ceil(list.length / 32);
      const table = [];
      for (let i = 0; i < L; i++) {
        const row = {};
        for (let ch = 97; ch <= 122; ch++) row[String.fromCharCode(ch)] = new Uint32Array(n);
        table.push(row);
      }
      list.forEach((w, k) => {
        for (let i = 0; i < L; i++) table[i][w[i]][k >> 5] |= 1 << (k & 31);
      });
      const all = new Uint32Array(n);
      for (let k = 0; k < list.length; k++) all[k >> 5] |= 1 << (k & 31);
      this.bits.set(L, { table, all, n });
    }
  }
  /** Candidate words matching pattern (array of letters or null), excluding `banned` set. */
  candidates(pattern, banned) {
    const L = pattern.length;
    const b = this.bits.get(L);
    if (!b) return [];
    const acc = b.all.slice();
    for (let i = 0; i < L; i++) {
      const ch = pattern[i];
      if (!ch) continue;
      const row = b.table[i][ch];
      for (let j = 0; j < b.n; j++) acc[j] &= row[j];
    }
    const list = this.byLen.get(L), out = [];
    for (let j = 0; j < b.n; j++) {
      let x = acc[j];
      while (x) {
        const t = x & -x;
        const k = (j << 5) + (31 - Math.clz32(t));
        const w = list[k];
        if (!banned.has(w)) out.push(w);
        x ^= t;
      }
    }
    return out;
  }
}

/**
 * Fill a template. Returns array of row strings or null.
 * `avoid`: words to avoid (recently used) — treated as banned.
 */
export function fill(tpl, index, rand, { avoid = new Set(), maxNodes = 30000, breadth = 25 } = {}) {
  const C = tpl[0].length;
  const slots = slotsOf(tpl);
  const grid = tpl.join('').split('').map((ch) => (ch === '#' ? '#' : null));
  const used = new Set();
  const banned = { has: (w) => used.has(w) || avoid.has(w) };
  const filled = new Array(slots.length).fill(false);
  let nodes = 0;
  const pattern = (s) => s.cells.map((i) => grid[i]);

  function rec() {
    if (++nodes > maxNodes) return false;
    let best = -1, bestC = null;
    for (let i = 0; i < slots.length; i++) {
      if (filled[i]) continue;
      const cs = index.candidates(pattern(slots[i]), banned);
      if (!cs.length) return false;
      if (!bestC || cs.length < bestC.length) { best = i; bestC = cs; }
    }
    if (best < 0) return true;
    // Prefer better-known words, with noise for variety.
    const ranked = bestC
      .map((w) => [w, (index.score.get(w) || 0) + rand() * 2.5])
      .sort((a, b) => b[1] - a[1])
      .slice(0, breadth)
      .map((x) => x[0]);
    const s = slots[best];
    for (const w of ranked) {
      const prev = s.cells.map((i) => grid[i]);
      s.cells.forEach((cell, k) => (grid[cell] = w[k]));
      used.add(w);
      filled[best] = true;
      if (rec()) return true;
      filled[best] = false;
      used.delete(w);
      s.cells.forEach((cell, k) => (grid[cell] = prev[k]));
    }
    return false;
  }
  if (!rec()) return null;
  const rows = [];
  for (let r = 0; r < tpl.length; r++) rows.push(grid.slice(r * C, r * C + C).join(''));
  return rows;
}

// ---------- Templates ----------

const transpose = (t) => t[0].split('').map((_, c) => t.map((row) => row[c]).join(''));
const mirror = (t) => t.map((row) => row.split('').reverse().join(''));

export const MINI_BASE = [
  ['#....', '.....', '.....', '.....', '....#'],
  ['##...', '#....', '.....', '....#', '...##'],
  ['#...#', '.....', '.....', '.....', '#...#'],
  ['.....', '.#.#.', '.....', '.#.#.', '.....'],
  ['##...', '#....', '.....', '.....', '.....'],
  ['#....', '#....', '.....', '....#', '....#'],
  ['...##', '....#', '.....', '#....', '##...'],
  ['.....', '.....', '..#..', '.....', '.....'],
  ['#....', '.....', '.....', '.....', '.....'],
  ['....#', '.....', '.....', '.....', '#....'],
];
export function miniTemplates() {
  const out = new Map();
  for (const t of MINI_BASE) for (const v of [t, transpose(t), mirror(t), transpose(mirror(t))]) out.set(v.join('/'), v);
  return [...out.values()];
}

/** Validate a British-style grid: no 2-runs, every white cell in an entry, <=2 consecutive unchecked, connected. */
export function validLattice(tpl) {
  const R = tpl.length, C = tpl[0].length;
  const slots = slotsOf(tpl);
  if (slots.some((s) => s.cells.length < 3)) return false;
  const count = new Array(R * C).fill(0);
  for (const s of slots) for (const c of s.cells) count[c]++;
  for (let i = 0; i < R * C; i++) if (tpl[Math.floor(i / C)][i % C] !== '#' && count[i] === 0) return false;
  for (const s of slots) {
    let run = 0, checked = 0;
    for (const c of s.cells) {
      if (count[c] >= 2) { run = 0; checked++; } else if (++run > 2) return false;
    }
    if (checked < Math.ceil(s.cells.length / 3)) return false;
  }
  // connectivity
  const whites = [];
  for (let i = 0; i < R * C; i++) if (tpl[Math.floor(i / C)][i % C] !== '#') whites.push(i);
  const seen = new Set([whites[0]]), stack = [whites[0]];
  while (stack.length) {
    const i = stack.pop(), r = Math.floor(i / C), c = i % C;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue;
      const j = rr * C + cc;
      if (tpl[rr][cc] !== '#' && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  if (seen.size !== whites.length) return false;
  const n = slots.length;
  const nines = slots.filter((s) => s.cells.length >= 9).length;
  return n >= 14 && n <= 22 && nines <= 4;
}

/** Random 9x9 lattice with 180-degree symmetry. */
export function randomLattice(rand) {
  const N = 9;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const g = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => (r % 2 && c % 2 ? '#' : '.')));
    const set = (r, c) => { g[r][c] = '#'; g[N - 1 - r][N - 1 - c] = '#'; };
    const edgeOpts = [[], [3], [5], [1], [7], [1, 7], [3, 7], [1, 5], [3], [5]];
    const innerOpts = [[], [3], [5], [3], [5]];
    for (const c of pick(edgeOpts, rand)) set(0, c);
    for (const c of pick(innerOpts, rand)) set(2, c);
    for (const r of pick(edgeOpts, rand)) set(r, 0);
    for (const r of pick(innerOpts, rand)) set(r, 2);
    if (rand() < 0.45) set(4, 4);
    const tpl = g.map((row) => row.join(''));
    if (validLattice(tpl)) return tpl;
  }
  throw new Error('no lattice');
}

/** Build the word index for crosswords: only words with clues; quality score from frequency. */
/**
 * Word index for crosswords: only words with clues. Fill quality score comes from word frequency,
 * plus `bonus` for words in `preferred` (the Mini uses this to favour words with tricky clues).
 */
export function crosswordIndex(bank, lengths, preferred = null, bonus = 0) {
  const lex = lexicon();
  const words = [...bank.keys()].filter((w) => lengths.includes(w.length));
  const score = new Map(words.map((w) => [w, (lex.get(w)?.zipf ?? 2.5) + (preferred?.has(w) ? bonus : 0)]));
  return new WordIndex(words, score);
}

export { shuffle };
