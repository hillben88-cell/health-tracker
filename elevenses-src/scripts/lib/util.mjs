// Shared helpers for the Elevenses puzzle build scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT = path.join(ROOT, 'content');
export const OUT = path.resolve(ROOT, '..', 'public', 'elevenses', 'data');

// Puzzle No. 1 is on EPOCH. Puzzles are generated up to END (inclusive).
export const EPOCH = '2026-09-01';
export const END = '2030-12-31';

export function dayCount(from = EPOCH, to = END) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;
}
export function dateOf(index) {
  return new Date(Date.parse(EPOCH + 'T00:00:00Z') + index * 86400000).toISOString().slice(0, 10);
}

// mulberry32 PRNG
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

let _lex;
/** Map word -> {level, zipf} from the SCOWL/wordfreq lexicon. */
export function lexicon() {
  if (_lex) return _lex;
  _lex = new Map();
  for (const line of fs.readFileSync(path.join(ROOT, 'lexicon', 'lexicon.tsv'), 'utf8').split('\n')) {
    if (!line) continue;
    const [w, l, z] = line.split('\t');
    _lex.set(w, { level: +l, zipf: +z });
  }
  return _lex;
}

export function readLines(file) {
  return fs
    .readFileSync(path.join(CONTENT, file), 'utf8')
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
}

export function blocklist() {
  return new Set(readLines('blocklist.txt').flatMap((l) => l.trim().toLowerCase().split(/\s+/)));
}

export function writeJSON(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(data));
  return fs.statSync(file).size;
}
