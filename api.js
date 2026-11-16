/* =====================================================================
   DOMPET · api.js
   Penyimpanan lokal, koneksi ke Apps Script, antrean offline, mode demo.
   ===================================================================== */
'use strict';

const APP_VERSION = '1.0.0';

/* ---------- Penyimpanan lokal (HP) ---------- */
const Store = {
  prefix: 'dompet.v1.',
  get(key, fallback) {
    try {
      const v = localStorage.getItem(this.prefix + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch (e) { /* penuh / diblokir */ }
  },
  del(key) {
    try { localStorage.removeItem(this.prefix + key); } catch (e) { /* abaikan */ }
  }
};

/* ---------- Utilitas bersama ---------- */
const Util = {
  /** Sidik jari baris — HARUS identik dengan fp_() di Code.gs */
  fp(d, a, c, n) {
    const s = d + '|' + a + '|' + c + '|' + n;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  },
  uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
};

class ApiError extends Error {
  constructor(message, code) { super(message); this.code = code || 'ERROR'; }
}

/* ---------- Koneksi ke Apps Script ---------- */
const Api = {
  async call(action, payload = {}, opts = {}) {
    const cfg = Store.get('cfg', {});
    if (cfg.demo) return Demo.call(action, payload);

    const body = JSON.stringify(Object.assign({ action, token: opts.token !== undefined ? opts.token : cfg.token }, payload));
    if (window.DOMPET_GAS) return this.gas(body, opts.timeout || 30000);

    const url = opts.api || cfg.api;
    if (!url) throw new ApiError('Alamat server belum diatur.', 'NO_API');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 30000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tanpa preflight CORS
        redirect: 'follow',
        cache: 'no-store',
        signal: ctrl.signal
      });
    } catch (e) {
      throw new ApiError(
        navigator.onLine
          ? 'Tidak bisa menghubungi server. Periksa sinyal, atau pastikan deploy Apps Script berakses "Siapa saja".'
          : 'Tidak ada koneksi internet.',
        'NETWORK');
    } finally {
      clearTimeout(timer);
    }
    let json;
    try { json = await res.json(); } catch (e) {
      throw new ApiError('Respons server tidak dikenali. Pastikan URL yang dipakai adalah URL Aplikasi Web (berakhiran /exec).', 'BAD_RESPONSE');
    }
    if (!json || !json.ok) throw new ApiError((json && json.error) || 'Terjadi kesalahan di server.', (json && json.code) || 'ERROR');
    return json;
  },

  /** Versi satu file: aplikasi disajikan Apps Script, panggil server lewat google.script.run */
  gas(body, timeout) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
      const timer = setTimeout(() => finish(reject, new ApiError(navigator.onLine ? 'Server tidak merespons. Coba lagi.' : 'Tidak ada koneksi internet.', 'NETWORK')), timeout);
      try {
        google.script.run
          .withSuccessHandler((res) => {
            let json;
            try { json = typeof res === 'string' ? JSON.parse(res) : res; } catch (e) { return finish(reject, new ApiError('Respons server tidak dikenali.', 'BAD_RESPONSE')); }
            if (!json || !json.ok) return finish(reject, new ApiError((json && json.error) || 'Terjadi kesalahan di server.', (json && json.code) || 'ERROR'));
            finish(resolve, json);
          })
          .withFailureHandler((err) => finish(reject, new ApiError(
            navigator.onLine ? 'Gagal menghubungi server' + (err && err.message ? ': ' + err.message : '.') : 'Tidak ada koneksi internet.', 'NETWORK')))
          .api(body);
      } catch (e) {
        finish(reject, new ApiError('Tidak ada koneksi internet.', 'NETWORK'));
      }
    });
  }
};

/* ---------- Antrean transaksi (offline-first) ---------- */
const Queue = {
  all() { return Store.get('queue', []); },
  save(q) { Store.set('queue', q); },
  push(tx) { const q = this.all(); q.push(tx); this.save(q); },
  remove(cid) { this.save(this.all().filter((t) => t.cid !== cid)); },
  patch(cid, patch) { this.save(this.all().map((t) => (t.cid === cid ? Object.assign({}, t, patch) : t))); },
  sendable() { return this.all().filter((t) => !t.error); }
};

/* ---------- Mode demo: data contoh, tanpa server ---------- */
const Demo = {
  db: null,

  load() {
    if (this.db) return this.db;
    this.db = Store.get('demo_db', null) || this.generate();
    return this.db;
  },
  persist() { Store.set('demo_db', this.db); },
  reset() { Store.del('demo_db'); this.db = null; },

  generate() {
    let seed = 20261116;
    const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const between = (a, b, step = 1000) => Math.round((a + rnd() * (b - a)) / step) * step;
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    const out = []; const inc = [];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    for (let i = 150; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const day = d.getDate(); const dow = d.getDay(); const s = iso(d);
      const n = rnd() < 0.55 ? 2 : 1;
      for (let k = 0; k < n; k++) out.push([s, between(12000, 65000, 500), 'Makan & Minum', pick(['Sarapan', 'Makan siang', 'Kopi', 'Makan malam', 'Jajan sore'])]);
      if (rnd() < 0.38) out.push([s, between(15000, 110000), 'Transportasi', pick(['Bensin', 'Parkir', 'Ojek online', 'Tol'])]);
      if (day === 2 || day === 17) out.push([s, between(350000, 950000, 5000), 'Belanja Bulanan', 'Belanja kebutuhan dapur']);
      if (day === 5) out.push([s, between(320000, 560000, 500), 'Tagihan', 'Token listrik']);
      if (day === 6) out.push([s, 385000, 'Tagihan', 'Internet rumah']);
      if (day === 10) out.push([s, between(110000, 190000, 500), 'Tagihan', 'PDAM']);
      if (rnd() < 0.035) out.push([s, between(45000, 350000, 500), 'Kesehatan', pick(['Apotek', 'Vitamin', 'Periksa dokter'])]);
      if ((dow === 0 || dow === 6) && rnd() < 0.35) out.push([s, between(50000, 260000), 'Hiburan', pick(['Nonton bioskop', 'Jalan-jalan', 'Langganan streaming'])]);
      if (rnd() < 0.02) out.push([s, between(100000, 600000, 5000), 'Pendidikan', pick(['Buku referensi', 'Biaya seminar', 'Fotokopi & jilid'])]);
      if (dow === 5 && rnd() < 0.6) out.push([s, between(20000, 100000, 5000), 'Sedekah', 'Jumat berkah']);
      if (rnd() < 0.05) out.push([s, between(30000, 220000, 500), 'Rumah Tangga', pick(['Sabun & deterjen', 'Perlengkapan rumah', 'Gas LPG'])]);
      if (day === 1) inc.push([s, 9250000, 'Gaji', 'Gaji bulanan']);
      if (day === 15) inc.push([s, 2100000, 'Tunjangan', 'Tunjangan kinerja']);
      if (day === 20) inc.push([s, between(150000, 450000, 500), 'Investasi', 'Bagi hasil emas']);
      if (rnd() < 0.05) inc.push([s, between(500000, 2500000, 50000), 'Honor', pick(['Honor narasumber', 'Honor tutor', 'Honor ahli'])]);
    }
    const toRows = (list) => list.map((r, i) => ({ row: i + 2, date: r[0], amount: r[1], category: r[2], note: r[3] }));
    return { in: toRows(inc), out: toRows(out) };
  },

  snapshot() {
    const db = this.load();
    const pack = (list) => list.map((r) => [r.row, r.date, r.amount, r.category, r.note, Util.fp(r.date, r.amount, r.category, r.note)]);
    const st = (k, name) => ({
      sheetName: name, headerRow: 1, headers: ['Tanggal', 'Kategori', 'Keterangan', 'Jumlah'],
      date: 1, category: 2, note: 3, amount: 4, source: 'auto', ready: true,
      txCount: db[k].length, lastTxRow: db[k].length + 1, footer: false, negative: false, formulaCols: []
    });
    return {
      ok: true,
      data: { in: pack(db.in), out: pack(db.out) },
      meta: { ssName: 'Keuangan (data contoh)', tz: 'Asia/Jakarta', version: APP_VERSION, serverTime: new Date().toISOString(),
        structure: { in: st('in', 'Pemasukan'), out: st('out', 'Pengeluaran') } }
    };
  },

  async call(action, p) {
    await Util.sleep(250 + Math.random() * 250);
    const db = this.load();
    switch (action) {
      case 'ping': return { ok: true, app: 'dompet', version: APP_VERSION, pinSet: true };
      case 'login': return { ok: true, token: 'demo' };
      case 'logout': return { ok: true };
      case 'bootstrap': case 'saveMapping': case 'resetMapping': return this.snapshot();
      case 'add': {
        const results = (p.txs || []).map((tx) => {
          if (!(tx.amount > 0)) return { cid: tx.cid, ok: false, error: 'Nominal harus lebih dari 0.' };
          const list = db[tx.type];
          const row = list.length + 2;
          list.push({ row, date: tx.date, amount: Math.round(tx.amount * 100) / 100, category: tx.category, note: tx.note || '' });
          return { cid: tx.cid, ok: true, row };
        });
        this.persist();
        return Object.assign(this.snapshot(), { results });
      }
      case 'update': {
        const tx = p.tx; const src = db[tx.origType];
        const idx = src.findIndex((r) => r.row === tx.row);
        const r = src[idx];
        if (!r || Util.fp(r.date, r.amount, r.category, r.note) !== tx.fp) throw new ApiError('Data di spreadsheet sudah berubah. Memuat ulang…', 'STALE');
        if (tx.origType === tx.type) Object.assign(r, { date: tx.date, amount: tx.amount, category: tx.category, note: tx.note });
        else {
          this.removeAt(tx.origType, idx);
          db[tx.type].push({ row: db[tx.type].length + 2, date: tx.date, amount: tx.amount, category: tx.category, note: tx.note });
        }
        this.persist();
        return this.snapshot();
      }
      case 'delete': {
        const list = db[p.type]; const idx = list.findIndex((r) => r.row === p.row); const r = list[idx];
        if (!r || Util.fp(r.date, r.amount, r.category, r.note) !== p.fp) throw new ApiError('Data di spreadsheet sudah berubah. Memuat ulang…', 'STALE');
        this.removeAt(p.type, idx);
        this.persist();
        return this.snapshot();
      }
      default: throw new ApiError('Aksi tidak dikenal.', 'BAD_REQUEST');
    }
  },

  removeAt(type, idx) {
    const list = this.db[type];
    list.splice(idx, 1);
    for (let i = idx; i < list.length; i++) list[i].row -= 1;
  }
};
