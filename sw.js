/* =====================================================================
   DOMPET · sw.js — service worker
   Membuat aplikasi terbuka cepat & tetap bisa dibuka saat offline.
   Data transaksi TIDAK pernah disimpan di sini (selalu lewat Apps Script).

   Aturan versi (mencegah file lama & baru tercampur):
   - Saat instal, SEMUA file satu versi diunduh sekaligus langsung dari server
     (melewati cache browser & CDN) dan diperiksa nomor versinya. Jika ada yang
     belum sama, instal dibatalkan dan dicoba lagi nanti; versi lama tetap jalan.
   - Halaman dan file aplikasi selalu diambil dari paket versi yang aktif.
   - Versi baru menggantikan paket lama secara utuh; aplikasi lalu memuat ulang sendiri.
   Ubah versi lewat tools/set-version.py.
   ===================================================================== */
const VERSION = '1.1.1';
const CACHE = 'dompet-' + VERSION;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './style.css', './api.js', './charts.js', './app.js', './assets.js',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];
// File yang wajib memuat nomor versi yang sama dengan service worker ini
const VERSIONED = ['./index.html', './api.js', './app.js', './assets.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const files = await Promise.all(SHELL.map(async (u) => {
      const res = await fetch(new Request(u + '?__v=' + VERSION, { cache: 'reload' }));
      if (!res.ok) throw new Error('Gagal mengunduh ' + u + ' (' + res.status + ')');
      if (VERSIONED.includes(u)) {
        const text = await res.clone().text();
        if (!text.includes("'" + VERSION + "'") && !text.includes('"' + VERSION + '"')) {
          throw new Error(u + ' belum versi ' + VERSION + ' (server masih memperbarui)');
        }
      }
      return [u, res];
    }));
    const cache = await caches.open(CACHE);
    await Promise.all(files.map(([u, res]) => cache.put(u, res)));
    await self.skipWaiting();
  })());
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

  // Halaman: dari paket versi aktif (instan & bisa offline), cadangan jaringan
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match('./index.html')) || (await cache.match('./')) || fetch(req);
    })());
    return;
  }

  // File aplikasi: dari paket versi aktif, cadangan jaringan (tidak disimpan)
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(req, { ignoreSearch: true })) || fetch(req)));
    return;
  }

  // Font Google: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    }));
  }
});
