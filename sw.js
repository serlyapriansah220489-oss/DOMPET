/* =====================================================================
   DOMPET · sw.js — service worker
   Membuat aplikasi terbuka instan & tetap bisa dibuka saat offline.
   Data transaksi TIDAK pernah disimpan di sini (selalu lewat Apps Script).
   Naikkan VERSION setiap kali file aplikasi diperbarui.
   ===================================================================== */
const VERSION = '1.1.0';
const CACHE = 'dompet-' + VERSION;
const SHELL = [
  './', './index.html', './style.css', './api.js', './charts.js', './app.js', './assets.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dompet-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API Google Apps Script: selalu langsung ke jaringan, tidak di-cache
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Halaman: tampilkan versi tersimpan dulu (instan), perbarui di latar belakang
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match('./index.html');
      const network = fetch(req).then((res) => { if (res.ok) cache.put('./index.html', res.clone()); return res; }).catch(() => cached);
      return cached || network;
    }));
    return;
  }

  // Aset aplikasi & font: stale-while-revalidate
  if (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: url.origin === self.location.origin });
      const network = fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    }));
  }
});
