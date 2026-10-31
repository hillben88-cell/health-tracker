// Quartets: sixteen tiles, four hidden groups of four.
import { readLines, rng, hash, shuffle } from './lib/util.mjs';

export function loadCategories() {
  return readLines('quartets.txt').map((line, id) => {
    const [level, tags, title, members] = line.split('|').map((s) => s.trim());
    return {
      id,
      level: +level,
      tags: tags.split(',').map((t) => t.trim()).filter((t) => t && t !== '-'),
      title,
      members: [...new Set(members.split(',').map((m) => m.trim().toUpperCase()).filter(Boolean))],
    };
  });
}

export function genQuartets(N) {
  const cats = loadCategories();
  const bad = cats.filter((c) => c.members.length < 4);
  if (bad.length) throw new Error('Quartets: too few members in ' + bad.map((c) => c.title).join(', '));
  const memberOf = new Map(); // member -> Set(cat ids)
  for (const c of cats) for (const m of c.members) {
    if (!memberOf.has(m)) memberOf.set(m, new Set());
    memberOf.get(m).add(c.id);
  }
  const byLevel = { 1: [], 2: [], 3: [], 4: [] };
  for (const c of cats) byLevel[c.level].push(c);
  const lastUsed = new Map();
  const memberLast = new Map();
  const out = [];
  const GAP = 40;

  for (let day = 0; day < N; day++) {
    const rand = rng(hash('quartets-day') + day * 104729);
    let made = null;
    for (let attempt = 0; attempt < 3000 && !made; attempt++) {
      const gap = attempt > 1500 ? GAP / 2 : GAP;
      const slotLevels = [1, 2, rand() < 0.6 ? 3 : 2, rand() < 0.75 ? 4 : 3];
      const chosen = [];
      const tags = new Set();
      let ok = true;
      for (const lv of slotLevels) {
        const pool = byLevel[lv].filter(
          (c) => !chosen.includes(c) && !c.tags.some((t) => tags.has(t)) && !(lastUsed.has(c.id) && day - lastUsed.get(c.id) < gap),
        );
        if (!pool.length) { ok = false; break; }
        const c = pool[Math.floor(rand() * pool.length)];
        chosen.push(c);
        c.tags.forEach((t) => tags.add(t));
      }
      if (!ok) continue;
      const ids = new Set(chosen.map((c) => c.id));
      // Members usable for each group: belong to no other chosen category.
      const groups = [];
      const usedText = new Set();
      for (const c of chosen) {
        const usable = c.members.filter((m) => [...memberOf.get(m)].every((id) => id === c.id || !ids.has(id)) && !usedText.has(m));
        if (usable.length < 4) { ok = false; break; }
        // prefer members not seen recently
        const ranked = shuffle(usable, rand).sort((a, b) => (memberLast.get(c.id + a) ?? -999) - (memberLast.get(c.id + b) ?? -999));
        const four = ranked.slice(0, 4);
        four.forEach((m) => usedText.add(m));
        groups.push({ c, four });
      }
      if (!ok) continue;
      // Colour order: by level, ties random.
      groups.sort((a, b) => a.c.level - b.c.level || rand() - 0.5);
      made = groups;
    }
    if (!made) throw new Error('Quartets: failed day ' + day);
    for (const g of made) {
      lastUsed.set(g.c.id, day);
      for (const m of g.four) memberLast.set(g.c.id + m, day);
    }
    const tiles = shuffle(made.flatMap((g, gi) => g.four.map((m) => [m, gi])), rand);
    out.push({
      g: made.map((g) => ({ t: g.c.title, m: g.four })),
      o: tiles.map(([m]) => m),
    });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const q = genQuartets(+process.argv[2] || 10);
  for (const d of q.slice(0, 4)) console.log(d.g.map((g) => `${g.t}: ${g.m.join(', ')}`).join('\n') + '\n');
}
