// Ramble: themed word trails. Every letter of a 6x7 grid belongs to exactly one theme word,
// each word traced through neighbouring cells (including diagonals).
import { readLines, rng, hash, shuffle } from './lib/util.mjs';

export const COLS = 6, ROWS = 7, CELLS = COLS * ROWS;

export function loadThemes() {
  return readLines('ramble.txt').map((line) => {
    const [name, clue, words] = line.split('|').map((s) => s.trim());
    const list = [...new Set(words.split(',').map((w) => w.trim().toUpperCase()).filter((w) => /^[A-Z]{4,10}$/.test(w)))];
    return { name, clue, words: list };
  });
}

const NEIGH = Array.from({ length: CELLS }, (_, i) => {
  const r = Math.floor(i / COLS), c = i % COLS, out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) out.push(rr * COLS + cc);
    }
  return out;
});

/** Pick a subset of words whose lengths sum to CELLS. */
function chooseWords(words, rand) {
  for (let t = 0; t < 4000; t++) {
    const pool = shuffle(words, rand);
    const chosen = [];
    let sum = 0;
    for (const w of pool) {
      if (sum + w.length <= CELLS) { chosen.push(w); sum += w.length; }
      if (sum === CELLS) break;
    }
    if (sum === CELLS && chosen.length >= 5 && chosen.length <= 8) return chosen;
  }
  return null;
}

function components(owner) {
  const seen = new Uint8Array(CELLS), out = [];
  for (let i = 0; i < CELLS; i++) {
    if (owner[i] !== -1 || seen[i]) continue;
    const comp = [], stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const x = stack.pop();
      comp.push(x);
      for (const y of NEIGH[x]) if (owner[y] === -1 && !seen[y]) { seen[y] = 1; stack.push(y); }
    }
    out.push(comp);
  }
  return out;
}

/** Can the remaining word lengths be split exactly across components? */
function partitionable(sizes, lengths) {
  if (!sizes.length) return lengths.length === 0;
  const target = sizes[0];
  const rest = sizes.slice(1);
  const n = lengths.length;
  // try subsets of lengths summing to target
  const rec = (i, sum, pickedMask) => {
    if (sum === target) {
      const remaining = lengths.filter((_, k) => !(pickedMask & (1 << k)));
      return partitionable(rest, remaining);
    }
    if (sum > target || i >= n) return false;
    return rec(i + 1, sum + lengths[i], pickedMask | (1 << i)) || rec(i + 1, sum, pickedMask);
  };
  return rec(0, 0, 0);
}

/** Tile the grid with the given words. Returns {grid, paths} or null. */
export function tile(words, rand, maxNodes = 60000) {
  const owner = new Int16Array(CELLS).fill(-1);
  const diag = new Set(); // diagonal edges used, as "a-b" with a<b
  const paths = new Array(words.length);
  let nodes = 0;
  const crosses = (a, b) => {
    const ra = Math.floor(a / COLS), ca = a % COLS, rb = Math.floor(b / COLS), cb = b % COLS;
    if (ra === rb || ca === cb) return false;
    const x = ra * COLS + cb, y = rb * COLS + ca;
    return diag.has(Math.min(x, y) + '-' + Math.max(x, y));
  };
  const addEdges = (p, on) => {
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1], b = p[k];
      if (Math.floor(a / COLS) !== Math.floor(b / COLS) && a % COLS !== b % COLS) {
        const key = Math.min(a, b) + '-' + Math.max(a, b);
        on ? diag.add(key) : diag.delete(key);
      }
    }
  };

  function place(remaining) {
    if (!remaining.length) return true;
    if (++nodes > maxNodes) return false;
    // most constrained empty cell
    let start = -1, best = 9;
    for (let i = 0; i < CELLS; i++) {
      if (owner[i] !== -1) continue;
      const free = NEIGH[i].filter((j) => owner[j] === -1).length;
      if (free < best) { best = free; start = i; }
    }
    for (const wi of shuffle(remaining, rand)) {
      const word = words[wi];
      const rest = remaining.filter((x) => x !== wi);
      for (const reversed of rand() < 0.5 ? [false, true] : [true, false]) {
        const path = [start];
        owner[start] = wi;
        const ok = extend(path, word.length, wi, () => {
          const p = reversed ? path.slice().reverse() : path.slice();
          const comps = components(owner).map((c) => c.length);
          if (!partitionable(comps, rest.map((x) => words[x].length))) return false;
          paths[wi] = p;
          addEdges(p, true);
          if (place(rest)) return true;
          addEdges(p, false);
          return false;
        });
        owner[start] = -1;
        if (ok) return true;
        if (nodes > maxNodes) return false;
      }
    }
    return false;
  }

  function extend(path, len, wi, done) {
    if (path.length === len) return done();
    if (++nodes > maxNodes) return false;
    const last = path[path.length - 1];
    const opts = shuffle(NEIGH[last].filter((j) => owner[j] === -1 && !crosses(last, j)), rand);
    for (const j of opts) {
      owner[j] = wi;
      path.push(j);
      if (extend(path, len, wi, done)) return true;
      path.pop();
      owner[j] = -1;
    }
    return false;
  }

  if (!place(words.map((_, i) => i))) return null;
  const grid = new Array(CELLS);
  words.forEach((w, i) => paths[i].forEach((cell, k) => (grid[cell] = w[k])));
  return { grid: grid.join(''), paths };
}

export function genRamble(N) {
  const themes = loadThemes();
  const out = [];
  const lastUsed = new Map();
  let order = shuffle(themes.map((_, i) => i), rng(hash('ramble')));
  let cursor = 0;
  for (let day = 0; day < N; day++) {
    const rand = rng(hash('ramble-day') + day * 7919);
    let made = null;
    for (let attempt = 0; attempt < themes.length * 3 && !made; attempt++) {
      if (cursor >= order.length) { order = shuffle(order, rand); cursor = 0; }
      const ti = order[cursor++];
      if (lastUsed.has(ti) && day - lastUsed.get(ti) < Math.min(60, themes.length - 5)) continue;
      const theme = themes[ti];
      for (let k = 0; k < 6 && !made; k++) {
        const words = chooseWords(theme.words, rand);
        if (!words) break;
        const t = tile(words, rand);
        if (t) made = { t: ti, g: t.grid, w: words, p: t.paths };
      }
      if (made) lastUsed.set(ti, day);
    }
    if (!made) throw new Error('Ramble: failed day ' + day);
    out.push(made);
  }
  return { themes: themes.map((t) => ({ n: t.name, c: t.clue })), days: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const r = genRamble(+process.argv[2] || 40);
  console.log('ms', Date.now() - t0);
  for (const d of r.days.slice(0, 3)) {
    console.log(r.themes[d.t].n, d.w.join(' '));
    for (let i = 0; i < ROWS; i++) console.log('  ' + d.g.slice(i * COLS, i * COLS + COLS).split('').join(' '));
  }
}
