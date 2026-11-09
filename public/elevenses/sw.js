// Elevenses service worker: offline app shell + cached puzzle data.
const VERSION = 'elevenses-v7';
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
  'js/games/conundrum.js',
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
      // 'reload' skips the browser's own cache, so a new version never installs old files.
      await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
      // Warm this year's puzzles so the app works offline straight away.
      const y = new Date().getFullYear();
      const extra = ['mini', 'midi', 'inkling', 'spokes', 'quartets', 'ramble', 'quiz', 'conundrum'].map((g) => `data/${g}/${y}.json`).concat('data/words.txt');
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

// The app's own files (page, scripts, styles) come from the network whenever there is one, so an
// update shows up the next time the app opens; the saved copy is only used offline or on a very slow
// connection. Puzzle data is served from the cache straight away and refreshed in the background.
const APP_FILE = /(?:\/|\.html|\.js|\.css|\.webmanifest)$/;
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const appFile = e.request.mode === 'navigate' || APP_FILE.test(url.pathname);
  e.respondWith(appFile ? networkFirst(e) : cacheFirst(e));
});

async function networkFirst(e) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = e.request.mode === 'navigate' ? fetch(e.request) : fetch(e.request, { cache: 'no-cache' });
    const res = await Promise.race([fresh, new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
    if (res.ok) {
      e.waitUntil(cache.put(e.request, res.clone()));
      return res;
    }
  } catch {}
  const saved = (await cache.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' ? await cache.match('index.html') : null);
  return saved || Response.error();
}

async function cacheFirst(e) {
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
  return (await network) || Response.error();
}
