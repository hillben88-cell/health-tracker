// Elevenses service worker: offline app shell + cached puzzle data.
const VERSION = 'elevenses-v5';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/core.js',
  'js/icons.js',
  'js/games/crossword.js',
  'js/games/mini.js',
  'js/games/midi.js',
  'js/games/inkling.js',
  'js/games/spokes.js',
  'js/games/quartets.js',
  'js/games/ramble.js',
  'js/games/quiz.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'data/clues.json',
  'data/clues-mini.json',
  'data/quiz/bank.json',
  'data/words5.txt',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(SHELL);
      // Warm this year's puzzles so the app works offline straight away.
      const y = new Date().getFullYear();
      const extra = ['mini', 'midi', 'inkling', 'spokes', 'quartets', 'ramble', 'quiz'].map((g) => `data/${g}/${y}.json`).concat('data/words.txt');
      await Promise.all(extra.map((u) => cache.add(u).catch(() => {})));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// Stale-while-revalidate: instant from cache, refreshed in the background.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (e.request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    })(),
  );
});
