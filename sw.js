/* 白日梦导演台 · Service Worker（离线可用） */
const CACHE = 'bdm-v19';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/store.js',
  './js/ui.js',
  './js/cameraSim.js',
  './js/breakdown.js',
  './js/views-core.js',
  './js/views-stage.js',
  './js/views-player.js',
  './js/views-tools.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', e => {
  // cache:'reload' 绕过 HTTP 缓存（GitHub Pages max-age=600 会把旧文件灌进新缓存）
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) {
        // 后台静默更新
        fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
    })
  );
});
