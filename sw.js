// Paprastas service worker: leidžia įdiegti programėlę telefone.
// Strategija „network-first“ – visada bandoma gauti naujausią versiją,
// be ryšio grąžinama paskutinė išsaugota.
const CACHE = 'defektai-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
