/* =====================================================================
   DOMPET · app.js — antarmuka & logika aplikasi
   ===================================================================== */
'use strict';

const APP_JS_VERSION = '1.1.1';

/* ---------- Helper DOM ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const haptic = (ms = 10) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* abaikan */ } };

/* ---------- Format angka & tanggal ---------- */
const NF = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const rp = (n) => 'Rp ' + NF.format(Math.abs(n));
const rpNet = (n) => (n < 0 ? '−' : '') + rp(n);
const rpSigned = (n, type) => (type === 'in' ? '+' : '−') + rp(n);
const shortNum = (x) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: x < 10 ? 1 : 0 }).format(x);
const compact = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return shortNum(a / 1e9) + ' M';
  if (a >= 1e6) return shortNum(a / 1e6) + ' jt';
  if (a >= 1e3) return shortNum(a / 1e3) + ' rb';
  return NF.format(a);
};

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_P = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => iso(new Date());
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const fmtLong = (s) => { const d = parseISO(s); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN_P[d.getMonth()]} ${d.getFullYear()}`; };
const fmtShort = (s) => { const d = parseISO(s); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDM = (s) => { const d = parseISO(s); return `${d.getDate()} ${BULAN[d.getMonth()]}`; };
const fmtDayDM = (s) => { const d = parseISO(s); return `${HARI[d.getDay()].slice(0, 3)}, ${d.getDate()} ${BULAN[d.getMonth()]}`; };
const fmtRange = (a, b) => {
  if (a === b) return fmtShort(a);
  const da = parseISO(a); const db = parseISO(b);
  return da.getFullYear() === db.getFullYear() ? `${fmtDM(a)} – ${fmtShort(b)}` : `${fmtShort(a)} – ${fmtShort(b)}`;
};
const relDay = (s) => { const t = today(); if (s === t) return 'Hari ini'; if (s === addDays(t, -1)) return 'Kemarin'; return fmtLong(s); };
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sheetName = (type) => (S.meta && S.meta.structure && S.meta.structure[type] ? S.meta.structure[type].sheetName : (type === 'in' ? 'Pemasukan' : 'Pengeluaran'));
const typeLabel = (type) => (type === 'in' ? 'Pemasukan' : type === 'tf' ? 'Transfer' : 'Pengeluaran');
const CAT_GOLD_BUY = 'Investasi Emas';
const CAT_GOLD_SELL = 'Penjualan Emas';
const APP_CATS = [CAT_GOLD_BUY, CAT_GOLD_SELL];
const GOLD_TAG = /\[(EM-\d+)\]/;
/** Pembelian emas = investasi, bukan konsumsi: dipisah dari statistik pengeluaran */
const isInvest = (t) => t.type === 'out' && t.category === CAT_GOLD_BUY;
/** Penjualan emas = pencairan investasi, bukan pemasukan rutin */
const isInvestIn = (t) => t.type === 'in' && t.category === CAT_GOLD_SELL;

/* ---------- State ---------- */
const S = {
  cfg: Store.get('cfg', {}),
  data: { in: [], out: [] },
  meta: null,
  ui: Object.assign({ period: { type: 'month' }, trend: 'daily', lastType: 'out', installDismissed: false,
    lastAccount: {}, assetTab: 'dana', assetPromoDismissed: false, showSold: false }, Store.get('ui', {})),
  assets: { enabled: false, accounts: [], transfers: [], gold: [], prices: [] },
  tab: 'home',
  loaded: false,
  syncing: false,
  syncState: 'idle',
  lastSync: 0,
  hist: { q: '', type: 'all', cat: '', acc: '', from: '', to: '', limit: 80 },
  lastHero: null
};
const saveUi = () => Store.set('ui', S.ui);

/* ---------- Data ---------- */
let memo = {};
const invalidate = () => { memo = {}; };

function mapRows(rows, type) {
  return (rows || []).map((r) => {
    const note = r[4] || '';
    const m = GOLD_TAG.exec(note);
    return { id: type + ':' + r[0], type, row: r[0], date: r[1], amount: r[2], category: r[3] || '', note, fp: r[5], account: r[6] || '', goldId: m ? m[1] : '' };
  });
}

function mapAssets(a) {
  a = a || {};
  return {
    enabled: !!a.enabled,
    accounts: (a.accounts || []).map((x) => ({ name: x[0], type: x[1] || 'Lainnya', opening: Number(x[2]) || 0, openingDate: x[3] || '', note: x[4] || '', status: x[5] || 'Aktif' })),
    transfers: (a.transfers || []).map((x) => ({ id: 'tf:' + x[0], type: 'tf', row: x[0], date: x[1], amount: x[2], from: x[3], to: x[4], note: x[5] || '', fp: x[6] })),
    gold: (a.gold || []).map((g) => Object.assign({}, g, { grams: Number(g.grams) || 0, total: Number(g.total) || 0, pieces: Number(g.pieces) || 1,
      pricePerGram: Number(g.pricePerGram) || 0, soldTotal: Number(g.soldTotal) || 0 })),
    prices: (a.prices || []).map((x) => ({ date: x[0], type: x[1], price: Number(x[2]) || 0 })).sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0))
  };
}

function setServerData(res) {
  S.data = { in: mapRows(res.data.in, 'in'), out: mapRows(res.data.out, 'out') };
  S.meta = res.meta;
  S.assets = mapAssets(res.assets);
  S.lastSync = Date.now();
  S.loaded = true;
  Store.set('cache', { data: res.data, meta: res.meta, assets: res.assets, at: S.lastSync });
  invalidate();
}

function loadCache() {
  const c = Store.get('cache', null);
  if (!c || !c.data) return;
  S.data = { in: mapRows(c.data.in, 'in'), out: mapRows(c.data.out, 'out') };
  S.meta = c.meta;
  S.assets = mapAssets(c.assets);
  S.lastSync = c.at || 0;
  invalidate();
}

function allTx() {
  if (memo.all) return memo.all;
  const q = Queue.all().filter((t) => t.type !== 'tf').map((t) => ({
    id: 'q:' + t.cid, cid: t.cid, type: t.type, date: t.date, amount: t.amount,
    category: t.category || '', note: t.note || '', account: t.account || '', pending: true, error: t.error || null, at: t.at || 0
  }));
  const list = S.data.in.concat(S.data.out, q);
  list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (!!a.pending !== !!b.pending) return a.pending ? -1 : 1;
    if (a.pending) return b.at - a.at;
    return (b.row || 0) - (a.row || 0);
  });
  memo.all = list;
  return list;
}

function findTx(id) { return allTx().find((t) => t.id === id) || allTransfers().find((t) => t.id === id) || null; }

/** Transfer antar akun (dari server + yang masih di antrean) */
function allTransfers() {
  if (memo.tf) return memo.tf;
  const q = Queue.all().filter((t) => t.type === 'tf').map((t) => ({
    id: 'q:' + t.cid, cid: t.cid, type: 'tf', date: t.date, amount: t.amount, from: t.from, to: t.to,
    note: t.note || '', pending: true, error: t.error || null, at: t.at || 0
  }));
  memo.tf = S.assets.transfers.concat(q).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.at || 0) - (a.at || 0) || (b.row || 0) - (a.row || 0)));
  return memo.tf;
}

/** Transaksi + transfer, terbaru dulu (untuk daftar) */
function allEntries() {
  if (memo.entries) return memo.entries;
  memo.entries = allTx().concat(allTransfers()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (!!a.pending !== !!b.pending) return a.pending ? -1 : 1;
    return (b.at || 0) - (a.at || 0) || (b.row || 0) - (a.row || 0);
  });
  return memo.entries;
}

/** Kategori per jenis, diurutkan dari yang paling sering dipakai (bobot lebih untuk 60 hari terakhir). */
function categories(type) {
  const key = 'cat_' + type;
  if (memo[key]) return memo[key];
  const score = {};
  const recent = addDays(today(), -60);
  allTx().forEach((t) => {
    if (t.type !== type || !t.category || APP_CATS.includes(t.category)) return;
    score[t.category] = (score[t.category] || 0) + (t.date >= recent ? 3 : 1);
  });
  memo[key] = Object.keys(score).sort((a, b) => score[b] - score[a] || a.localeCompare(b, 'id'));
  return memo[key];
}

/** Warna tetap per kategori pengeluaran (berdasarkan total sepanjang waktu). */
function catColor(cat) {
  if (!memo.colors) {
    const tot = {};
    allTx().forEach((t) => { if (t.type === 'out' && !isInvest(t)) { const c = t.category || 'Tanpa kategori'; tot[c] = (tot[c] || 0) + t.amount; } });
    memo.colors = {};
    Object.keys(tot).sort((a, b) => tot[b] - tot[a]).forEach((k, i) => { memo.colors[k] = Charts.palette[i] || null; });
  }
  return memo.colors[cat] || null;
}

/** Peta total per hari & per bulan (pengeluaran & pemasukan). */
function aggregates() {
  if (memo.agg) return memo.agg;
  const dayOut = {}; const monIn = {}; const monOut = {}; const monInv = {};
  allTx().forEach((t) => {
    if (t.error) return;
    const m = t.date.slice(0, 7);
    if (isInvest(t)) monInv[m] = (monInv[m] || 0) + t.amount;
    else if (isInvestIn(t)) return;
    else if (t.type === 'out') { dayOut[t.date] = (dayOut[t.date] || 0) + t.amount; monOut[m] = (monOut[m] || 0) + t.amount; }
    else monIn[m] = (monIn[m] || 0) + t.amount;
  });
  memo.agg = { dayOut, monIn, monOut, monInv };
  return memo.agg;
}

function needsCategory(type) {
  const st = S.meta && S.meta.structure && S.meta.structure[type];
  return !st || st.category > 0;
}

/* ---------- Periode ---------- */
function range(p = S.ui.period) {
  const t = today();
  switch (p.type) {
    case 'today': return { from: t, to: t, label: 'Hari ini', cmp: 'kemarin' };
    case 'week': { const dow = (parseISO(t).getDay() + 6) % 7; return { from: addDays(t, -dow), to: t, label: 'Minggu ini', cmp: 'minggu lalu' }; }
    case 'custom': return { from: p.from, to: p.to, label: fmtRange(p.from, p.to), cmp: 'periode sebelumnya' };
    default: return { from: t.slice(0, 8) + '01', to: t, label: 'Bulan ini', cmp: 'bulan lalu' };
  }
}

function prevRange(p, r) {
  if (p.type === 'month') {
    const d = parseISO(r.from);
    const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
    const lastDay = new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate();
    const endDay = Math.min(parseISO(r.to).getDate(), lastDay);
    return { from: iso(pm), to: iso(new Date(pm.getFullYear(), pm.getMonth(), endDay, 12)) };
  }
  if (p.type === 'week') return { from: addDays(r.from, -7), to: addDays(r.to, -7) };
  const n = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

function stats(r) {
  const s = { inc: 0, out: 0, invest: 0, investIn: 0, nIn: 0, nOut: 0, nInv: 0, byCat: {}, byCatN: {}, incCat: {}, byDay: {}, maxTx: null };
  allTx().forEach((t) => {
    if (t.error || t.date < r.from || t.date > r.to) return;
    if (isInvest(t)) { s.invest += t.amount; s.nInv++; return; }
    if (isInvestIn(t)) { s.investIn += t.amount; return; }
    if (t.type === 'in') {
      s.inc += t.amount; s.nIn++;
      const c = t.category || 'Tanpa kategori'; s.incCat[c] = (s.incCat[c] || 0) + t.amount;
    } else {
      s.out += t.amount; s.nOut++;
      const c = t.category || 'Tanpa kategori';
      s.byCat[c] = (s.byCat[c] || 0) + t.amount; s.byCatN[c] = (s.byCatN[c] || 0) + 1;
      s.byDay[t.date] = (s.byDay[t.date] || 0) + t.amount;
      if (!s.maxTx || t.amount > s.maxTx.amount) s.maxTx = t;
    }
  });
  const t = today();
  const end = r.to > t ? t : r.to;
  s.days = Math.max(1, diffDays(r.from, end < r.from ? r.from : end) + 1);
  s.net = s.inc - s.out - s.invest + s.investIn;
  s.avgDaily = s.out / s.days;
  return s;
}

/* =====================================================================
   RENDER
   ===================================================================== */
function renderCurrent() {
  const views = { home: renderHome, history: renderHistory, stats: renderStats, settings: renderSettings, assets: typeof renderAssets === 'function' ? renderAssets : null };
  try {
    const fn = views[S.tab];
    if (!fn) throw new Error('Bagian tampilan "' + S.tab + '" belum termuat');
    fn();
  } catch (e) {
    console.error(e);
    showRenderError(e);
  }
  updateSyncPill();
}

/** Bila tampilan gagal (mis. file versi lama tercampur), tampilkan pesan + tombol pemulihan, bukan layar kosong */
function showRenderError(e) {
  const target = $({ home: '#homeBody', history: '#histList', stats: '#statsBody', settings: '#settingsBody', assets: '#assetsBody' }[S.tab] || '#homeBody');
  if (!target) return;
  target.innerHTML = `<div class="card empty"><div class="empty-art">${icon('alert')}</div><h3>Tampilan gagal dimuat</h3>
    <p>Biasanya karena file versi lama masih tersimpan di HP. Data dan antreanmu aman.</p>
    <button class="btn-primary" data-action="hard-reload" type="button">${icon('refresh')}Muat ulang aplikasi</button>
    <p class="card-sub" style="margin-top:12px">${esc(e && e.message ? e.message : e)}</p></div>`;
}

/** Hapus cache tampilan & service worker, lalu muat ulang. Data (token, antrean, cache data) tidak disentuh. */
async function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) { /* abaikan */ }
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.indexOf('dompet-') === 0).map((k) => caches.delete(k)));
    }
  } catch (e) { /* abaikan */ }
  location.reload();
}

/* ---------- Pembaruan aplikasi ----------
   Setiap kali dibuka, aplikasi memeriksa versi baru di server. Versi baru diunduh utuh
   di latar belakang; begitu siap, aplikasi memuat ulang sendiri saat tidak ada lembar
   input yang terbuka (isian yang sedang diketik tidak pernah hilang). */
let updateReady = false;
function setupServiceWorker() {
  try {
    if (window.DOMPET_PREVIEW || window.DOMPET_GAS || !('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || updateReady) return;   // pemasangan pertama tidak perlu dimuat ulang
      updateReady = true;
      applyUpdate();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => { /* offline / gagal: dicoba lagi saat dibuka berikutnya */ });
  } catch (e) { /* abaikan */ }
}
function applyUpdate() {
  if (!updateReady) return;
  const idle = !sheetStack.length && $('#dialog').hidden && !S.syncing && !F.saving;
  if (!idle) return;                     // dicoba lagi saat lembar ditutup / sinkron selesai
  updateReady = false;
  location.reload();
}

/** Semua file tampilan harus satu versi; jika tidak, muat ulang bersih sekali per sesi */
function versionMismatch() {
  const meta = document.querySelector('meta[name="dompet-version"]');
  const vs = [meta ? meta.content : '?', APP_VERSION, APP_JS_VERSION, typeof ASSETS_JS_VERSION !== 'undefined' ? ASSETS_JS_VERSION : 'hilang'];
  return vs.some((v) => v !== vs[0]) ? vs : null;
}

function switchTab(tab) {
  if (S.tab === tab) { window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }); return; }
  S.tab = tab;
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === tab));
  $$('.nav-btn').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
  window.scrollTo(0, 0);
  renderCurrent();
}

function renderPeriodBars() {
  const p = S.ui.period;
  const html = [['today', 'Hari ini'], ['week', 'Minggu ini'], ['month', 'Bulan ini']]
    .map(([k, l]) => `<button class="pchip ${p.type === k ? 'on' : ''}" data-p="${k}" type="button">${l}</button>`).join('') +
    `<button class="pchip ${p.type === 'custom' ? 'on' : ''}" data-p="custom" type="button">${icon('calendar')}${p.type === 'custom' ? esc(fmtRange(p.from, p.to)) : 'Custom'}</button>`;
  $$('[data-period]').forEach((el) => { el.innerHTML = html; });
}

function emptyState(ic, title, text, withBtn) {
  return `<div class="card empty"><div class="empty-art">${icon(ic)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>` +
    (withBtn ? `<button class="btn-primary" data-action="add" type="button">${icon('plus')}Tambah Transaksi</button>` : '') + '</div>';
}

function skeleton() {
  return `<div class="skel" style="height:172px;border-radius:26px;margin-bottom:14px"></div>
    <div class="card"><div class="skel" style="height:16px;width:45%;margin-bottom:14px"></div><div class="skel" style="height:40px;margin-bottom:10px"></div><div class="skel" style="height:40px;margin-bottom:10px"></div><div class="skel" style="height:40px"></div></div>
    <div class="card"><div class="skel" style="height:16px;width:55%;margin-bottom:14px"></div><div class="skel" style="height:28px;margin-bottom:12px"></div><div class="skel" style="height:90px"></div></div>`;
}

function txItem(t, opts = {}) {
  const badge = t.pending ? (t.error ? '<span class="badge err">Gagal</span>' : '<span class="badge pending">Menunggu</span>') : '';
  const when = opts.showDate ? `<small>${esc(relDayShort(t.date))}</small>` : '';
  if (t.type === 'tf') {
    return `<button class="tx" data-tx="${esc(t.id)}" type="button">
    <span class="tx-ico tf">${icon('swap')}</span>
    <span class="tx-main"><span class="tx-cat">${esc(t.from)} → ${esc(t.to)}${badge}</span><span class="tx-note">${esc(t.note || 'Transfer antar akun')}</span></span>
    <span class="tx-amt tf">${rp(t.amount)}${when}</span>
  </button>`;
  }
  const initial = (t.category || '•').trim().charAt(0).toUpperCase();
  const gold = t.goldId ? '<span class="badge gold">Emas</span>' : '';
  const sub = [t.goldId ? t.note.replace(GOLD_TAG, '').trim() : t.note, t.account].filter(Boolean).join(' · ') || (opts.showDate ? '' : typeLabel(t.type));
  return `<button class="tx" data-tx="${esc(t.id)}" type="button">
    <span class="tx-ico ${t.goldId ? 'gold' : t.type}">${t.goldId ? icon('gold') : esc(initial)}</span>
    <span class="tx-main"><span class="tx-cat">${esc(t.category || 'Tanpa kategori')}${gold}${badge}</span>${sub ? `<span class="tx-note">${esc(sub)}</span>` : ''}</span>
    <span class="tx-amt ${t.type}">${rpSigned(t.amount, t.type)}${when}</span>
  </button>`;
}
const relDayShort = (s) => { const t = today(); if (s === t) return 'Hari ini'; if (s === addDays(t, -1)) return 'Kemarin'; return fmtDM(s); };

function deltaChip(cur, prev, upIsBad) {
  if (!prev) return '';
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 1) return '<span class="delta flat">≈ sama</span>';
  const up = pct > 0;
  const cls = up === upIsBad ? 'bad' : 'good';
  const txt = Math.abs(pct) > 999 ? '>999%' : Math.round(Math.abs(pct)) + '%';
  return `<span class="delta ${cls}" title="${up ? 'Naik' : 'Turun'} ${txt}">${icon(up ? 'up' : 'down')}${txt}</span>`;
}

function insightRows(s, ps, r, full) {
  const rows = [];
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const top = cats[0];
  rows.push({ ic: 'spark', k: 'Pengeluaran terbesar',
    v: top ? `${esc(top[0])} <small>· ${rp(top[1])} (${Math.round((top[1] / s.out) * 100)}%)</small>` : 'Belum ada pengeluaran' });
  rows.push({ ic: 'clock', k: 'Rata-rata pengeluaran harian', v: `${rp(Math.round(s.avgDaily))} <small>· ${s.days} hari</small>` });
  rows.push({ ic: 'chart', k: `Pengeluaran vs ${r.cmp}`,
    v: ps.out ? `${rp(s.out)} <small>vs ${rp(ps.out)}</small>` : '<small>Belum ada data pembanding</small>',
    right: deltaChip(s.out, ps.out, true) });
  if (full) {
    rows.push({ ic: 'in', k: `Pemasukan vs ${r.cmp}`,
      v: ps.inc ? `${rp(s.inc)} <small>vs ${rp(ps.inc)}</small>` : (s.inc ? `${rp(s.inc)} <small>· belum ada pembanding</small>` : '<small>Belum ada pemasukan</small>'),
      right: deltaChip(s.inc, ps.inc, false) });
    if (s.inc > 0) {
      const keep = ((s.inc - s.out) / s.inc) * 100;
      rows.push({ ic: 'wallet', k: 'Sisa dari pemasukan', v: keep >= 0 ? `${Math.round(keep)}% <small>· ${rp(s.inc - s.out)}</small>` : `Defisit <small>· ${rp(s.out - s.inc)}</small>` });
    }
    const days = Object.entries(s.byDay).sort((a, b) => b[1] - a[1]);
    if (days.length > 1) rows.push({ ic: 'calendar', k: 'Hari paling boros', v: `${esc(fmtDayDM(days[0][0]))} <small>· ${rp(days[0][1])}</small>` });
    if (s.invest || s.investIn) rows.push({ ic: 'gold', k: 'Investasi emas', v: [s.invest ? `beli ${rp(s.invest)}` : '', s.investIn ? `jual ${rp(s.investIn)}` : ''].filter(Boolean).join(' · ') + ' <small>· dipisah dari pemasukan & pengeluaran</small>' });
    if (s.maxTx) rows.push({ ic: 'out', k: 'Transaksi terbesar', v: `${rp(s.maxTx.amount)} <small>· ${esc(s.maxTx.category || 'Tanpa kategori')}${s.maxTx.note ? ' · ' + esc(s.maxTx.note) : ''}</small>` });
  }
  return rows.map((x) => `<div class="insight"><span class="bub">${icon(x.ic)}</span><div class="txt"><div class="k">${x.k}</div><div class="v">${x.v}</div></div>${x.right || ''}</div>`).join('');
}

function greeting() {
  const h = new Date().getHours();
  const g = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  return S.cfg.name ? `${g}, ${S.cfg.name}` : g;
}

/* ---------- Beranda ---------- */
function renderHome() {
  $('#todayLabel').textContent = fmtLong(today());
  $('#greet').textContent = greeting();
  renderPeriodBars();
  const body = $('#homeBody');
  const list = allEntries();
  if (!list.length) {
    body.innerHTML = S.loaded ? emptyState('wallet', 'Belum ada transaksi', 'Tekan tombol + di bawah untuk mencatat transaksi pertamamu. Data langsung masuk ke spreadsheet.', true) : skeleton();
    return;
  }
  const r = range();
  const s = stats(r);
  const ps = stats(prevRange(S.ui.period, r));

  let html = '';
  if (window.DOMPET_GAS && !S.ui.installDismissed) {
    html += `<div class="card" style="display:flex;align-items:flex-start;gap:12px">
      <span class="tx-ico in" style="background:var(--grad-soft);color:var(--violet)">${icon('wallet')}</span>
      <div style="flex:1"><b style="font-size:14px">Taruh di layar utama</b><div class="card-sub">Chrome: ⋮ → Tambahkan ke layar utama. Samsung Internet: ☰ → Tambahkan halaman ke → Layar Utama.</div></div>
      <button class="icon-btn" data-action="install-dismiss" type="button" aria-label="Tutup" style="width:32px;height:32px">${icon('x')}</button></div>`;
  }
  if (installEvt && !S.ui.installDismissed) {
    html += `<div class="card" style="display:flex;align-items:center;gap:12px">
      <span class="tx-ico in" style="background:var(--grad-soft);color:var(--violet)">${icon('wallet')}</span>
      <div style="flex:1"><b style="font-size:14px">Pasang di layar utama</b><div class="card-sub">Buka & catat dalam satu ketukan.</div></div>
      <button class="btn-soft sm" data-action="install" type="button">Pasang</button>
      <button class="icon-btn" data-action="install-dismiss" type="button" aria-label="Tutup" style="width:32px;height:32px">${icon('x')}</button></div>`;
  }
  html += `<div class="hero">
      <p class="hero-label">Saldo bersih · ${esc(r.label)}</p>
      <div class="hero-value num" id="heroValue">${rpNet(s.net)}</div>
      <div class="hero-split">
        <div class="hero-stat"><div class="top"><span class="bub in">${icon('in')}</span><small>Pemasukan</small></div><b class="num">${rp(s.inc)}</b></div>
        <div class="hero-stat"><div class="top"><span class="bub out">${icon('out')}</span><small>Pengeluaran</small></div><b class="num">${rp(s.out)}</b></div>
      </div>
      ${s.invest || s.investIn ? `<div class="hero-note">${icon('gold')}<span>Emas: ${[s.invest ? `beli <b class="num">${rp(s.invest)}</b>` : '', s.investIn ? `jual <b class="num">${rp(s.investIn)}</b>` : ''].filter(Boolean).join(' · ')} · dipisah dari pemasukan &amp; pengeluaran</span></div>` : ''}
    </div>`;
  html += assetHomeCard();
  html += `<div class="card"><div class="card-head"><h3 class="card-title">Insight</h3><button class="card-link" data-goto="stats" type="button">Analisis${icon('chev-r')}</button></div>
      <div class="insights">${insightRows(s, ps, r, false)}</div></div>`;
  html += `<div class="card"><div class="card-head"><div><h3 class="card-title">Pengeluaran per kategori</h3><p class="card-sub">${esc(r.label)} · ${s.nOut} transaksi</p></div></div>
      <div id="homeCats">${s.out ? '' : '<p class="card-sub">Belum ada pengeluaran di periode ini.</p>'}</div></div>`;
  html += `<div class="card" style="padding-bottom:6px"><div class="card-head" style="margin-bottom:4px"><h3 class="card-title">Transaksi terbaru</h3><button class="card-link" data-goto="history" type="button">Semua${icon('chev-r')}</button></div>
      <div>${list.slice(0, 5).map((t) => txItem(t, { showDate: true })).join('')}</div></div>`;
  body.innerHTML = html;

  if (s.out) {
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const items = []; let other = 0;
    cats.forEach(([label, value]) => {
      const color = catColor(label);
      if (items.length < 5 && color) items.push({ label, value, color }); else other += value;
    });
    if (other > 0) items.push({ label: 'Lainnya', value: other, color: Charts.other });
    Charts.segBar($('#homeCats'), items, rp);
  }
  animateHero(s.net);
}

function animateHero(to) {
  const el = $('#heroValue');
  const from = S.lastHero;
  S.lastHero = to;
  if (!el || from === null || from === to || reducedMotion) return;
  const t0 = performance.now(); const dur = 520;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3);
    el.textContent = rpNet(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Riwayat ---------- */
function histFiltered() {
  const h = S.hist;
  const q = h.q.trim().toLowerCase();
  const qNum = q.replace(/[^\d]/g, '');
  const numericQ = q && /^[\d.,\s]+$/.test(q);
  return allEntries().filter((t) => {
    if (h.type !== 'all' && t.type !== h.type) return false;
    if (h.cat && (t.type === 'tf' || t.category !== h.cat)) return false;
    if (h.acc) {
      if (h.acc === '__none__') { if (t.type === 'tf' || t.account) return false; }
      else if (t.type === 'tf' ? (t.from !== h.acc && t.to !== h.acc) : t.account !== h.acc) return false;
    }
    if (h.from && (t.date < h.from || t.date > h.to)) return false;
    if (!q) return true;
    if (numericQ) return qNum && String(Math.round(t.amount)).includes(qNum);
    const text = t.type === 'tf' ? `${t.from} ${t.to} transfer ${t.note}` : `${t.category} ${t.note} ${t.account}`;
    return text.toLowerCase().includes(q) || fmtShort(t.date).toLowerCase().includes(q);
  });
}

function renderHistFilters() {
  const h = S.hist;
  const cats = h.type === 'all'
    ? Array.from(new Set(categories('out').concat(categories('in')))).sort((a, b) => a.localeCompare(b, 'id'))
    : categories(h.type).slice().sort((a, b) => a.localeCompare(b, 'id'));
  const typeChip = (k, l) => `<button class="fchip ${h.type === k ? 'on' : ''}" data-htype="${k}" type="button">${l}</button>`;
  const active = h.type !== 'all' || h.cat || h.acc || h.from || h.q;
  const accs = S.assets.accounts;
  const accName = h.acc === '__none__' ? 'Tanpa akun' : h.acc;
  $('#histFilters').innerHTML =
    typeChip('all', 'Semua') + typeChip('out', 'Pengeluaran') + typeChip('in', 'Pemasukan') +
    (allTransfers().length ? typeChip('tf', 'Transfer') : '') +
    (accs.length ? `<label class="fchip ${h.acc ? 'on' : ''}">${icon('bank')}<span>${esc(accName || 'Akun')}</span>${icon('chev-d')}
      <select id="histAcc" aria-label="Filter akun"><option value="">Semua akun</option>${accs.map((a) => `<option value="${esc(a.name)}" ${a.name === h.acc ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}<option value="__none__" ${h.acc === '__none__' ? 'selected' : ''}>Tanpa akun</option></select></label>` : '') +
    `<label class="fchip ${h.cat ? 'on' : ''}">${icon('list')}<span>${esc(h.cat || 'Kategori')}</span>${icon('chev-d')}
      <select id="histCat" aria-label="Filter kategori"><option value="">Semua kategori</option>${cats.map((c) => `<option ${c === h.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` +
    `<button class="fchip ${h.from ? 'on' : ''}" data-action="hist-date" type="button">${icon('calendar')}${h.from ? esc(fmtRange(h.from, h.to)) : 'Semua waktu'}</button>` +
    (active ? `<button class="fchip" data-action="hist-reset" type="button">${icon('x')}Reset</button>` : '');
}

function renderHistory() {
  renderHistFilters();
  const list = histFiltered();
  const sumIn = list.reduce((a, t) => a + (t.type === 'in' && !t.error ? t.amount : 0), 0);
  const sumOut = list.reduce((a, t) => a + (t.type === 'out' && !t.error ? t.amount : 0), 0);
  const nTf = list.filter((t) => t.type === 'tf').length;
  $('#histSummary').innerHTML = list.length
    ? `<span><b>${list.length - nTf}</b> transaksi${nTf ? ` · <b>${nTf}</b> transfer` : ''}</span><span>Masuk <b>${rp(sumIn)}</b></span><span>Keluar <b>${rp(sumOut)}</b></span>` : '';

  if (!allEntries().length) {
    $('#histList').innerHTML = S.loaded ? emptyState('list', 'Riwayat masih kosong', 'Transaksi yang kamu catat akan muncul di sini, dikelompokkan per hari.', true) : skeleton();
    $('#histMore').innerHTML = '';
    return;
  }
  if (!list.length) {
    $('#histList').innerHTML = emptyState('search', 'Tidak ada yang cocok', 'Coba kata kunci lain atau hapus filter.', false);
    $('#histMore').innerHTML = '';
    return;
  }
  const shown = list.slice(0, S.hist.limit);
  const groups = [];
  shown.forEach((t) => {
    let g = groups[groups.length - 1];
    if (!g || g.date !== t.date) { g = { date: t.date, items: [], inc: 0, out: 0 }; groups.push(g); }
    g.items.push(t);
    if (!t.error && t.type !== 'tf') { if (t.type === 'in') g.inc += t.amount; else g.out += t.amount; }
  });
  $('#histList').innerHTML = groups.map((g) => {
    const tot = [g.inc ? `+${rp(g.inc)}` : '', g.out ? `−${rp(g.out)}` : ''].filter(Boolean).join(' · ');
    return `<div class="tx-group"><div class="tx-date"><span>${esc(relDay(g.date))}</span><span class="num">${tot}</span></div>
      <div class="tx-card">${g.items.map((t) => txItem(t)).join('')}</div></div>`;
  }).join('');
  $('#histMore').innerHTML = list.length > shown.length
    ? `<button class="btn-soft" data-action="hist-more" type="button">Tampilkan lebih banyak (${list.length - shown.length})</button>` : '';
  observeMore();
}

let moreObserver = null;
function observeMore() {
  if (!('IntersectionObserver' in window)) return;
  if (!moreObserver) {
    moreObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && S.tab === 'history') { S.hist.limit += 80; renderHistory(); }
    }, { rootMargin: '300px' });
  }
  moreObserver.disconnect();
  const btn = $('#histMore button');
  if (btn) moreObserver.observe(btn);
}

/* ---------- Analisis ---------- */
function renderStats() {
  renderPeriodBars();
  const body = $('#statsBody');
  if (!allTx().length) {
    body.innerHTML = S.loaded ? emptyState('chart', 'Belum ada data untuk dianalisis', 'Catat beberapa transaksi dulu. Grafik dan insight akan muncul otomatis.', true) : skeleton();
    return;
  }
  const r = range();
  const s = stats(r);
  const ps = stats(prevRange(S.ui.period, r));
  const trend = S.ui.trend;

  body.innerHTML = `
    <div class="card"><div class="card-head"><div><h3 class="card-title">Pengeluaran per kategori</h3><p class="card-sub">${esc(r.label)} · total ${rp(s.out)}</p></div></div>
      <div id="stCats">${s.out ? '' : '<p class="card-sub">Belum ada pengeluaran di periode ini.</p>'}</div></div>
    <div class="card"><div class="card-head"><div><h3 class="card-title">Tren pengeluaran</h3><p class="card-sub" id="trendSub"></p></div>
      <div class="toggle" role="group" aria-label="Skala tren"><button class="${trend === 'daily' ? 'on' : ''}" data-trend="daily" type="button">Harian</button><button class="${trend === 'monthly' ? 'on' : ''}" data-trend="monthly" type="button">Bulanan</button></div></div>
      <div id="stTrend"></div></div>
    <div class="card"><div class="card-head"><div><h3 class="card-title">Pemasukan vs pengeluaran</h3><p class="card-sub" id="vsSub"></p></div></div>
      <div class="chart-legend"><span><i class="sw" style="background:var(--c-in)"></i>Pemasukan</span><span><i class="sw" style="background:var(--c-out)"></i>Pengeluaran</span></div>
      <div id="stVs"></div></div>
    <div class="card"><div class="card-head"><div><h3 class="card-title">Pemasukan per kategori</h3><p class="card-sub">${esc(r.label)} · total ${rp(s.inc)}</p></div></div>
      <div id="stInc">${s.inc ? '' : '<p class="card-sub">Belum ada pemasukan di periode ini.</p>'}</div></div>
    <div class="card"><div class="card-head"><h3 class="card-title">Insight</h3></div><div class="insights">${insightRows(s, ps, r, true)}</div></div>`;

  // Kategori pengeluaran (berperingkat)
  if (s.out) {
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const items = cats.slice(0, 8).map(([label, value]) => ({ label, value, color: catColor(label) || Charts.other, sub: `${s.byCatN[label]} transaksi`, tap: true }));
    const rest = cats.slice(8);
    if (rest.length) items.push({ label: `Lainnya (${rest.length} kategori)`, value: rest.reduce((a, x) => a + x[1], 0), color: Charts.other });
    Charts.rankBars($('#stCats'), items, rp, (x) => {
      if (!x.tap) return;
      S.hist = { q: '', type: 'out', cat: x.label, acc: '', from: r.from, to: r.to, limit: 80 };
      $('#histSearch').value = '';
      switchTab('history');
    });
  }
  if (s.inc) {
    const items = Object.entries(s.incCat).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: 'var(--c-in)' }));
    Charts.rankBars($('#stInc'), items, rp);
  }

  const agg = aggregates();
  // Tren
  if (trend === 'daily') {
    let from = r.from; const to = r.to;
    if (diffDays(from, to) < 6) from = addDays(to, -6);
    if (diffDays(from, to) > 91) from = addDays(to, -91);
    const labels = []; const values = []; const dates = [];
    for (let d = from; d <= to; d = addDays(d, 1)) { dates.push(d); labels.push(String(parseISO(d).getDate())); values.push(agg.dayOut[d] || 0); }
    const total = values.reduce((a, b) => a + b, 0);
    $('#trendSub').textContent = `${fmtRange(from, to)} · rata-rata ${rp(Math.round(total / values.length))}/hari`;
    Charts.columns($('#stTrend'), {
      labels, series: [{ name: 'Pengeluaran', color: '#6d4ae6', values }],
      fmtTick: (v) => (v ? compact(v) : '0'), fmtVal: rp, tipTitle: (i) => fmtDayDM(dates[i]), tableHead: 'Tanggal',
      ariaLabel: 'Grafik pengeluaran harian'
    });
  } else {
    const months = monthList(r, 6);
    const values = months.map((m) => agg.monOut[m] || 0);
    $('#trendSub').textContent = `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`;
    Charts.columns($('#stTrend'), {
      labels: months.map((m) => BULAN[+m.slice(5) - 1]), series: [{ name: 'Pengeluaran', color: '#6d4ae6', values }],
      fmtTick: (v) => (v ? compact(v) : '0'), fmtVal: rp, tipTitle: (i) => monthLabel(months[i], true), tableHead: 'Bulan',
      ariaLabel: 'Grafik pengeluaran bulanan'
    });
  }
  // Pemasukan vs pengeluaran per bulan
  const vsMonths = monthList(r, 6);
  $('#vsSub').textContent = `${monthLabel(vsMonths[0])} – ${monthLabel(vsMonths[vsMonths.length - 1])}`;
  const vin = vsMonths.map((m) => agg.monIn[m] || 0);
  const vout = vsMonths.map((m) => agg.monOut[m] || 0);
  Charts.columns($('#stVs'), {
    labels: vsMonths.map((m) => BULAN[+m.slice(5) - 1]),
    series: [{ name: 'Pemasukan', color: '#0f9f8f', values: vin }, { name: 'Pengeluaran', color: '#6d4ae6', values: vout }],
    fmtTick: (v) => (v ? compact(v) : '0'), fmtVal: rp, tipTitle: (i) => monthLabel(vsMonths[i], true), tableHead: 'Bulan',
    tipExtra: (i) => `Selisih ${vin[i] - vout[i] >= 0 ? '+' : '−'}${rp(vin[i] - vout[i])}`,
    ariaLabel: 'Grafik pemasukan dibanding pengeluaran per bulan'
  });
}

function monthList(r, min) {
  const end = parseISO(r.to);
  const start = parseISO(r.from);
  const span = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
  const n = Math.min(12, Math.max(min, span));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1, 12);
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return out;
}
const monthLabel = (m, full) => `${(full ? BULAN_P : BULAN)[+m.slice(5) - 1]} ${m.slice(0, 4)}`;

/* ---------- Pengaturan ---------- */
function renderSettings() {
  const st = S.meta && S.meta.structure;
  const q = Queue.all();
  const ago = S.lastSync ? timeAgo(S.lastSync) : 'belum pernah';
  let html = `<div class="card"><div class="card-head"><h3 class="card-title">Koneksi</h3></div><ul class="set-list">
      <li class="set-item"><span class="bub">${icon('sheet')}</span><div class="txt"><div class="k">${esc(S.meta ? S.meta.ssName : 'Spreadsheet')}</div><div class="s">${S.cfg.demo ? 'Mode demo (data contoh)' : 'Google Sheets'} · sinkron ${esc(ago)}</div></div>
        <button class="btn-soft sm" data-action="sync" type="button">${icon('refresh')}Sinkron</button></li>`;
  if (q.length) {
    const errs = q.filter((t) => t.error).length;
    html += `<li class="set-item"><span class="bub">${icon('clock')}</span><div class="txt"><div class="k">${q.length} transaksi di antrean</div><div class="s">${errs ? errs + ' gagal, ketuk transaksinya di Riwayat untuk memperbaiki' : 'Akan dikirim otomatis saat online'}</div></div>
      <button class="btn-soft sm" data-action="flush" type="button">Kirim</button></li>`;
  }
  html += '</ul></div>';

  html += `<div class="card"><div class="card-head"><div><h3 class="card-title">Struktur sheet</h3><p class="card-sub">Kolom yang dibaca & ditulis aplikasi</p></div></div>`;
  ['out', 'in'].forEach((k) => {
    const s = st && st[k];
    if (!s) { html += `<p class="card-sub">Belum tersinkron.</p>`; return; }
    const cell = (c) => (c ? `<span class="colchip">${colLetter(c)}</span>${esc(s.headers[c - 1] || '(tanpa judul)')}` : '<span style="color:var(--ink-3)">Tidak dipakai</span>');
    html += `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc(s.sheetName)}</b>
        <span class="badge ${s.ready ? 'pending' : 'err'}">${s.ready ? (s.source === 'manual' ? 'Diatur manual' : 'Terdeteksi otomatis') : 'Perlu diatur'}</span></div>
      <table class="map-sum"><tr><td>Baris header</td><td>${s.headerRow}</td></tr><tr><td>Tanggal</td><td>${cell(s.date)}</td></tr><tr><td>Nominal</td><td>${cell(s.amount)}</td></tr><tr><td>Kategori</td><td>${cell(s.category)}</td></tr><tr><td>Catatan</td><td>${cell(s.note)}</td></tr><tr><td>Akun</td><td>${cell(s.account)}</td></tr></table>
      <div class="card-sub">${s.txCount} transaksi terbaca${s.formulaCols && s.formulaCols.length ? ` · rumus kolom ${esc(s.formulaCols.join(', '))} ikut disalin` : ''}${s.negative ? ' · nominal ditulis negatif' : ''}</div>
      ${s.footer ? `<div class="note-warn">${icon('info')}<span>Ada baris lain di bawah data (mis. TOTAL). Transaksi baru disisipkan di atasnya.</span></div>` : ''}
      ${S.cfg.demo ? '' : `<button class="btn-soft sm" style="margin-top:10px" data-map="${k}" type="button">${icon('edit')}Ubah pemetaan</button>`}</div>`;
  });
  html += '</div>';

  html += `<div class="card"><div class="card-head"><h3 class="card-title">Profil</h3></div>
    <label class="field" style="margin:0"><span>Nama panggilan (untuk sapaan)</span><input id="nameInput" type="text" maxlength="24" placeholder="mis. Rian" value="${esc(S.cfg.name || '')}" autocomplete="off"></label></div>`;

  html += `<div class="card"><div class="card-head"><h3 class="card-title">Perangkat & keamanan</h3></div><ul class="set-list">`;
  if (installEvt) html += `<li class="set-item"><span class="bub">${icon('wallet')}</span><div class="txt"><div class="k">Pasang di layar utama</div><div class="s">Akses cepat seperti aplikasi biasa</div></div><button class="btn-soft sm" data-action="install" type="button">Pasang</button></li>`;
  if (S.cfg.demo) {
    html += `<li class="set-item danger"><button class="bub" data-action="exit-demo" type="button" aria-label="Keluar demo">${icon('logout')}</button><div class="txt" data-action="exit-demo"><div class="k">Keluar dari mode demo</div><div class="s">Hubungkan ke spreadsheet asli</div></div></li>`;
  } else {
    html += `<li class="set-item"><span class="bub">${icon('edit')}</span><div class="txt"><div class="k">Ganti PIN</div><div class="s">Semua perangkat lain otomatis keluar</div></div><button class="btn-soft sm" data-action="change-pin" type="button">Ganti</button></li>
      <li class="set-item"><span class="bub">${icon('lock')}</span><div class="txt"><div class="k">Kunci aplikasi</div><div class="s">Minta PIN saat dibuka lagi</div></div><button class="btn-soft sm" data-action="lock" type="button">Kunci</button></li>
      <li class="set-item danger"><span class="bub">${icon('logout')}</span><div class="txt"><div class="k">Putuskan perangkat ini</div><div class="s">${window.DOMPET_GAS ? 'Hapus sesi & salinan data di HP ini.' : 'Hapus alamat server & data lokal di HP.'} Spreadsheet tidak terpengaruh.</div></div><button class="btn-soft sm" data-action="disconnect" type="button">Putuskan</button></li>`;
  }
  html += `<li class="set-item"><span class="bub">${icon('refresh')}</span><div class="txt"><div class="k">Muat ulang aplikasi</div><div class="s">Ambil versi terbaru dan bersihkan cache tampilan. Data & antrean aman.</div></div><button class="btn-soft sm" data-action="hard-reload" type="button">Muat ulang</button></li>`;
  html += `</ul></div><p class="app-foot">Dompet v${APP_VERSION} · datamu tersimpan di Google Sheets milikmu</p>`;
  $('#settingsBody').innerHTML = html;
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'baru saja';
  if (s < 3600) return Math.round(s / 60) + ' menit lalu';
  if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
  return Math.round(s / 86400) + ' hari lalu';
}

/* ---------- Status sinkron ---------- */
function setSync(state) { S.syncState = state; updateSyncPill(); $('#progress').classList.toggle('on', state === 'syncing'); }
function updateSyncPill() {
  const pill = $('#syncPill'); if (!pill) return;
  const pending = Queue.all().length;
  pill.classList.remove('syncing', 'offline', 'error');
  let text;
  if (S.syncState === 'syncing') { pill.classList.add('syncing'); text = 'Menyinkron…'; }
  else if (S.syncState === 'offline') { pill.classList.add('offline'); text = pending ? `Offline · ${pending} antre` : 'Offline'; }
  else if (S.syncState === 'error') { pill.classList.add('error'); text = 'Gagal sinkron'; }
  else if (pending) { pill.classList.add('offline'); text = `${pending} menunggu`; }
  else text = S.lastSync ? 'Tersinkron' : 'Memuat…';
  $('#syncText').textContent = text;
}

/* =====================================================================
   SINKRONISASI
   ===================================================================== */
async function sync() {
  if (S.syncing) return;
  if (Queue.sendable().length) { await flushQueue(); return; }
  S.syncing = true; setSync('syncing');
  try {
    setServerData(await Api.call('bootstrap'));
    setSync('ok');
  } catch (e) {
    onSyncError(e, false);
  } finally {
    S.syncing = false;
    renderCurrent();
    applyUpdate();
  }
}

let flushing = null;
async function flushQueue(opts = {}) {
  if (flushing) return flushing;
  const items = Queue.sendable();
  if (!items.length) return null;
  flushing = (async () => {
    S.syncing = true; setSync('syncing');
    try {
      const res = await Api.call('add', { txs: items.map((t) => ({ cid: t.cid, type: t.type, date: t.date, amount: t.amount, category: t.category, note: t.note, account: t.account, from: t.from, to: t.to })) });
      const okIds = []; const errs = [];
      (res.results || []).forEach((x) => (x.ok ? okIds.push(x.cid) : errs.push(x)));
      Queue.save(Queue.all().filter((t) => !okIds.includes(t.cid)).map((t) => {
        const e = errs.find((x) => x.cid === t.cid);
        return e ? Object.assign({}, t, { error: e.error }) : t;
      }));
      setServerData(res);
      setSync('ok');
      if (okIds.length && !errs.length) {
        const first = items.find((t) => t.cid === okIds[0]);
        toast(okIds.length === 1 ? `Tersimpan ke sheet ${first.type === 'tf' ? 'Transfer' : sheetName(first.type)}` : `${okIds.length} transaksi tersimpan ke spreadsheet`, 'success');
      }
      if (errs.length) toast('Gagal menyimpan: ' + errs[0].error, 'error', { action: 'Perbaiki', onAction: () => openDetail('q:' + errs[0].cid) });
    } catch (e) {
      onSyncError(e, opts.announce);
    } finally {
      S.syncing = false;
      flushing = null;
      invalidate();
      renderCurrent();
      if (Queue.sendable().length && S.syncState === 'ok') setTimeout(() => flushQueue(), 400);
      else setTimeout(applyUpdate, 1800);   // beri waktu notifikasi "Tersimpan" terbaca
    }
  })();
  return flushing;
}

function onSyncError(e, announce) {
  if (e.code === 'AUTH') { onAuthExpired(); return; }
  if (e.code === 'NETWORK') {
    setSync('offline');
    if (announce) toast('Sedang offline. Transaksi aman tersimpan di HP dan akan dikirim otomatis.', 'warn', { duration: 4200 });
    return;
  }
  setSync('error');
  if (announce !== false) toast(e.message, 'error', { duration: 5000 });
}

function onAuthExpired() {
  S.cfg.token = null;
  Store.set('cfg', S.cfg);
  showAuth('Sesi berakhir. Masukkan PIN lagi.');
}

/* =====================================================================
   LEMBAR BAWAH (bottom sheet) + tombol kembali Android
   ===================================================================== */
const sheetStack = [];
let ignorePop = 0;
let historyOk = true;
function safeHistory(fn, state) {
  try { history[fn](state, ''); } catch (e) { historyOk = false; }
}

function openSheet(id, opts = {}) {
  const el = $('#' + id);
  const scrim = $('#scrim');
  if (opts.replace && sheetStack.length) {
    const prev = $('#' + sheetStack.pop());
    prev.classList.remove('on'); prev.hidden = true;
    safeHistory('replaceState', { sheet: id });
  } else {
    safeHistory('pushState', { sheet: id });
  }
  sheetStack.push(id);
  el.style.zIndex = String(40 + sheetStack.length);
  el.hidden = false; scrim.hidden = false;
  el.style.transform = '';
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('on'); scrim.classList.add('on'); }));
}

function closeSheet(fromPop) {
  const id = sheetStack.pop();
  if (!id) return;
  const el = $('#' + id);
  el.classList.remove('on');
  el.style.transform = '';
  if (!sheetStack.length) $('#scrim').classList.remove('on');
  setTimeout(() => { if (!sheetStack.includes(id)) el.hidden = true; if (!sheetStack.length) { $('#scrim').hidden = true; applyUpdate(); } }, 340);
  if (!fromPop && historyOk && history.state && history.state.sheet === id) { ignorePop++; history.back(); }
  if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
}

window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  if (!$('#dialog').hidden) { $('#dlgCancel').click(); return; }
  if (sheetStack.length) closeSheet(true);
});

// Geser ke bawah untuk menutup
function enableSwipe(el) {
  let y0 = null; let dy = 0;
  el.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.grabber, .sheet-head')) return;
    y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 === null) return;
    el.style.transition = '';
    if (dy > 90) closeSheet(); else el.style.transform = '';
    y0 = null;
  });
}

/* ---------- Dialog konfirmasi ---------- */
function confirmDlg({ title, msg, ok = 'Hapus', ic = 'trash' }) {
  return new Promise((resolve) => {
    const w = $('#dialog');
    $('#dlgTitle').textContent = title;
    $('#dlgMsg').textContent = msg;
    $('#dlgOk').textContent = ok;
    $('#dlgIcon').innerHTML = icon(ic);
    w.hidden = false;
    const done = (v) => {
      w.hidden = true;
      $('#dlgOk').onclick = null; $('#dlgCancel').onclick = null; w.onclick = null;
      resolve(v);
    };
    $('#dlgOk').onclick = () => done(true);
    $('#dlgCancel').onclick = () => done(false);
    w.onclick = (e) => { if (e.target === w) done(false); };
    setTimeout(() => $('#dlgCancel').focus(), 50);
  });
}

/* ---------- Toast ---------- */
function toast(msg, type = 'info', opts = {}) {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const ic = { success: 'check', error: 'alert', info: 'info', warn: 'offline' }[type] || 'info';
  el.innerHTML = `<span class="ti">${icon(ic)}</span><span class="tmsg"></span>`;
  el.querySelector('.tmsg').textContent = msg;
  let timer;
  const dismiss = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  if (opts.action) {
    const b = document.createElement('button');
    b.className = 'tact'; b.type = 'button'; b.textContent = opts.action;
    b.onclick = () => { dismiss(); opts.onAction(); };
    el.appendChild(b);
  }
  while (wrap.children.length >= 2) wrap.firstChild.remove();
  wrap.appendChild(el);
  timer = setTimeout(dismiss, opts.duration || (opts.action ? 6500 : 2800));
  return dismiss;
}

/* =====================================================================
   FORM TAMBAH / EDIT
   ===================================================================== */
const F = { mode: 'add', editing: null, type: 'out', amount: '', touched: false, category: '', date: '', note: '', account: '', from: '', to: '', expanded: false, newCat: false, saving: false };

/** Akun default: terakhir dipakai untuk jenis ini, atau akun aktif pertama */
function defaultAccount(type) {
  const names = activeAccounts().map((a) => a.name);
  const last = (S.ui.lastAccount || {})[type];
  return names.includes(last) ? last : (names[0] || '');
}

function openAdd(opts = {}) {
  const t = opts.tx || null;
  let type = t ? t.type : (opts.type || S.ui.lastType || 'out');
  if (type === 'tf' && !t && activeAccounts().length < 2) type = 'out';
  const names = activeAccounts().map((a) => a.name);
  const from = t && t.type === 'tf' ? t.from : defaultAccount('tf_from');
  Object.assign(F, {
    mode: t ? 'edit' : 'add', editing: t, type,
    amount: t ? String(Math.round(t.amount)) : '', touched: false,
    category: t && t.type !== 'tf' ? t.category : '', date: t ? t.date : today(), note: t ? t.note : '',
    account: t ? (t.account || '') : defaultAccount(type),
    from, to: t && t.type === 'tf' ? t.to : (names.find((n) => n !== from) || ''),
    expanded: false, newCat: false, saving: false
  });
  $('#addTitle').textContent = t ? 'Edit Transaksi' : 'Tambah Transaksi';
  $('#noteInput').value = F.note;
  $('#addErr').textContent = '';
  renderForm();
  openSheet('sheetAdd', { replace: !!opts.replace });
}

function formTypes() {
  if (F.mode === 'edit') return F.editing.type === 'tf' ? ['tf'] : ['out', 'in'];
  return activeAccounts().length >= 2 ? ['out', 'in', 'tf'] : ['out', 'in'];
}

function renderForm() {
  const sheet = $('#sheetAdd');
  sheet.dataset.type = F.type;
  const types = formTypes();
  const seg = $('#typeSeg');
  seg.dataset.type = F.type;
  seg.innerHTML = '<span class="seg-ind"></span>' + types.map((k) =>
    `<button type="button" role="radio" data-type="${k}" aria-checked="${k === F.type}">${typeLabel(k)}</button>`).join('');
  seg.style.setProperty('--n', types.length);
  seg.style.setProperty('--i', Math.max(0, types.indexOf(F.type)));
  const tf = F.type === 'tf';
  $('#catSection').hidden = tf;
  $('#tfSection').hidden = !tf;
  renderAmount();
  if (tf) renderTfChips(); else { renderChips(); renderAccChips(); }
  renderDate();
  setSaving(F.saving);
}

function accChip(name, attr, selected) {
  const a = S.assets.accounts.find((x) => x.name === name);
  return `<button class="chip ${name === selected ? 'on' : ''}" ${attr}="${esc(name)}" type="button">${icon(accIcon(a ? a.type : ''))}${esc(name)}</button>`;
}

/** Pilihan akun (Dibayar dari / Masuk ke) untuk pemasukan & pengeluaran */
function renderAccChips() {
  const box = $('#accSection');
  const accs = activeAccounts();
  if (!accs.length) { box.hidden = true; return; }
  box.hidden = false;
  const names = accs.map((a) => a.name);
  if (F.account && !names.includes(F.account)) names.unshift(F.account);
  $('#accLabel').textContent = F.type === 'in' ? 'Masuk ke akun' : 'Dibayar dari akun';
  $('#accChips').innerHTML = names.map((n) => accChip(n, 'data-accpick', F.account)).join('');
}

function renderTfChips() {
  const names = activeAccounts().map((a) => a.name);
  [F.from, F.to].forEach((n) => { if (n && !names.includes(n)) names.push(n); });
  $('#tfFrom').innerHTML = names.map((n) => accChip(n, 'data-tffrom', F.from)).join('');
  $('#tfTo').innerHTML = names.map((n) => accChip(n, 'data-tfto', F.to)).join('');
}

function renderAmount(pop) {
  const out = $('#amountOut');
  const n = Number(F.amount || 0);
  out.textContent = NF.format(n);
  out.classList.toggle('has', n > 0);
  if (pop && !reducedMotion) { out.classList.remove('pop'); void out.offsetWidth; out.classList.add('pop'); }
}

function renderChips() {
  const box = $('#catChips');
  const label = $('#sheetAdd .mini-label');
  if (!needsCategory(F.type)) {
    label.textContent = 'Kategori';
    box.innerHTML = `<p class="card-sub" style="margin:0">Sheet ${esc(sheetName(F.type))} tidak punya kolom kategori.</p>`;
    return;
  }
  label.textContent = 'Kategori';
  let list = categories(F.type).slice();
  if (F.category && !list.includes(F.category)) list.unshift(F.category);
  const LIMIT = 8;
  let shown = list;
  if (!F.expanded && list.length > LIMIT) {
    shown = list.slice(0, LIMIT);
    if (F.category && !shown.includes(F.category)) shown = [F.category].concat(shown.slice(0, LIMIT - 1));
  }
  let html = shown.map((c) => `<button class="chip ${c === F.category ? 'on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('');
  if (list.length > LIMIT) html += `<button class="chip ghost" data-action="cat-more" type="button">${F.expanded ? 'Lebih sedikit' : `+${list.length - shown.length} lainnya`}</button>`;
  html += F.newCat
    ? `<span class="chip-input"><input id="newCatInput" type="text" maxlength="40" placeholder="Nama kategori baru" enterkeyhint="done" autocomplete="off"><button type="button" data-action="cat-add" aria-label="Tambahkan">${icon('check')}</button></span>`
    : `<button class="chip ghost" data-action="cat-new" type="button">${icon('plus')}Baru</button>`;
  if (!list.length && !F.newCat) html = `<p class="card-sub" style="margin:0 0 8px;width:100%">Belum ada kategori ${F.type === 'in' ? 'pemasukan' : 'pengeluaran'}. Buat yang pertama:</p>` + html;
  box.innerHTML = html;
  if (F.newCat) setTimeout(() => { const i = $('#newCatInput'); if (i) i.focus(); }, 30);
}

function renderDate() {
  const t = today();
  $('#dateLabel').textContent = F.date === t ? 'Hari ini' : F.date === addDays(t, -1) ? 'Kemarin' : fmtDayDM(F.date) + (F.date.slice(0, 4) !== t.slice(0, 4) ? ' ' + F.date.slice(0, 4) : '');
  $('#dateInput').value = F.date;
  $('#dateQuick').textContent = F.date === t ? 'Kemarin' : 'Hari ini';
  $('#dateChip').classList.toggle('on', F.date !== t);
}

function pressKey(k) {
  if (F.saving) return;
  let a = F.amount;
  if (k === 'back') a = a.slice(0, -1);
  else if (k === '000') { if (a) a += '000'; }
  else if (/^\d$/.test(k)) a = a === '0' ? k : a + k;
  a = a.replace(/^0+(?=\d)/, '').slice(0, 13);
  if (a === F.amount) return;
  F.amount = a; F.touched = true;
  $('#addErr').textContent = '';
  renderAmount(true);
  haptic(6);
}

function setSaving(on) {
  F.saving = on;
  const b = $('#saveBtn');
  b.disabled = on;
  b.innerHTML = on ? '<span class="spinner"></span><span>Menyimpan…</span>' : `${icon('check')}<span>${F.mode === 'edit' ? 'Simpan perubahan' : 'Simpan'}</span>`;
}

function formError(msg) {
  $('#addErr').textContent = msg;
  const box = $('#amountBox');
  box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  haptic(40);
}

async function saveForm() {
  if (F.saving) return;
  if (F.newCat) { const v = ($('#newCatInput') || {}).value; if (v && v.trim()) addNewCategory(v); }
  const note = $('#noteInput').value.replace(/\s+/g, ' ').trim();
  const amount = F.mode === 'edit' && !F.touched ? F.editing.amount : Number(F.amount || 0);
  if (!amount || amount <= 0 || !isFinite(amount)) return formError('Nominal belum diisi. Ketik jumlahnya dulu.');
  if (amount > 1e13) return formError('Nominal terlalu besar.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(F.date)) return formError('Tanggal tidak valid.');
  let tx;
  if (F.type === 'tf') {
    if (!F.from || !F.to) return formError('Pilih akun asal dan tujuan.');
    if (F.from === F.to) return formError('Akun asal dan tujuan tidak boleh sama.');
    tx = { type: 'tf', date: F.date, amount, from: F.from, to: F.to, note };
  } else {
    if (needsCategory(F.type) && !F.category) return formError('Pilih kategori dulu.');
    tx = { type: F.type, date: F.date, amount, category: needsCategory(F.type) ? F.category : '', note, account: activeAccounts().length || F.account ? F.account : '' };
  }

  if (F.mode === 'add') {
    Queue.push(Object.assign({ cid: Util.uid(), at: Date.now() }, tx));
    S.ui.lastType = F.type;
    S.ui.lastAccount = Object.assign({}, S.ui.lastAccount, F.type === 'tf' ? { tf_from: F.from } : { [F.type]: F.account });
    saveUi();
    invalidate();
    closeSheet();
    haptic(15);
    renderCurrent();
    flushQueue({ announce: true });
    return;
  }
  if (F.editing.pending) {
    Queue.patch(F.editing.cid, Object.assign({}, tx, { error: null }));
    invalidate(); closeSheet(); renderCurrent();
    flushQueue({ announce: true });
    return;
  }
  setSaving(true);
  try {
    const res = await Api.call('update', { tx: Object.assign({ origType: F.editing.type, row: F.editing.row, fp: F.editing.fp }, tx) });
    setServerData(res);
    closeSheet();
    toast('Perubahan tersimpan di spreadsheet', 'success');
    renderCurrent();
  } catch (e) {
    handleWriteError(e, true);
  } finally {
    setSaving(false);
  }
}

function handleWriteError(e, inForm) {
  if (e.code === 'AUTH') { closeSheet(); onAuthExpired(); return; }
  if (e.code === 'STALE') { closeSheet(); toast(e.message, 'warn', { duration: 4500 }); sync(); return; }
  if (e.code === 'NETWORK') { toast('Edit & hapus butuh koneksi internet. Coba lagi saat online.', 'warn', { duration: 4500 }); return; }
  if (inForm) $('#addErr').textContent = e.message;
  toast(e.message, 'error', { duration: 5000 });
}

function addNewCategory(v) {
  const name = v.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return;
  const existing = categories(F.type).find((c) => c.toLowerCase() === name.toLowerCase());
  F.category = existing || name;
  F.newCat = false;
  renderChips();
}

/* =====================================================================
   DETAIL, HAPUS, BATALKAN
   ===================================================================== */
let detailId = null;

function openDetail(id) {
  const t = findTx(id);
  if (!t) return;
  detailId = id;
  const where = t.pending
    ? (t.error ? 'Gagal dikirim' : 'Menunggu dikirim ke spreadsheet')
    : `Sheet ${t.type === 'tf' ? 'Transfer' : sheetName(t.type)} · baris ${t.row}`;
  const rows = t.type === 'tf'
    ? `<li><span>Dari akun</span><b>${esc(t.from)}</b></li><li><span>Ke akun</span><b>${esc(t.to)}</b></li>`
    : `<li><span>Kategori</span><b>${esc(t.category || 'Tanpa kategori')}</b></li>${S.assets.accounts.length ? `<li><span>Akun</span><b>${esc(t.account || 'Tanpa akun')}</b></li>` : ''}`;
  $('#detailBody').innerHTML = `
    <div class="detail-hero"><div class="tx-ico ${t.type === 'tf' ? 'tf' : t.goldId ? 'gold' : t.type}">${t.type === 'tf' ? icon('swap') : t.goldId ? icon('gold') : esc((t.category || '•').charAt(0).toUpperCase())}</div>
      <div class="detail-amt ${t.type}">${t.type === 'tf' ? rp(t.amount) : rpSigned(t.amount, t.type)}</div><div class="detail-type">${typeLabel(t.type)}</div></div>
    <ul class="kv">
      ${rows}
      <li><span>Tanggal</span><b>${esc(fmtLong(t.date))}</b></li>
      <li><span>Catatan</span><b>${esc(t.note || '—')}</b></li>
      <li><span>Lokasi data</span><b>${esc(where)}</b></li>
    </ul>
    ${t.goldId ? `<div class="note-warn">${icon('info')}<span>Baris ini dibuat otomatis dari catatan emas ${esc(t.goldId)}. Ubah atau hapus lewat Aset → Emas supaya keduanya tetap sinkron.</span></div>` : ''}
    ${t.error ? `<div class="note-warn note-err">${icon('alert')}<span>${esc(t.error)}</span></div>` : ''}
    ${t.pending && !t.error ? `<div class="note-warn">${icon('clock')}<span>Transaksi ini tersimpan di HP dan akan dikirim otomatis saat ada koneksi.</span></div>` : ''}`;
  $('#detailActions').innerHTML = t.goldId
    ? `<button class="btn-primary" style="grid-column:1/-1" data-a="gold:${esc(t.goldId)}" type="button">${icon('gold')}Buka catatan emas</button>`
    : `<button class="btn-outline-danger" data-action="del" type="button">${icon('trash')}${t.pending ? 'Buang' : 'Hapus'}</button>
    <button class="btn-primary" data-action="edit" type="button">${icon('edit')}${t.error ? 'Perbaiki' : 'Edit'}</button>`;
  openSheet('sheetDetail');
}

async function deleteCurrent() {
  const t = findTx(detailId);
  if (!t) return;
  const what = t.type === 'tf' ? `${rp(t.amount)} · ${t.from} → ${t.to}` : `${rpSigned(t.amount, t.type)} · ${t.category || 'Tanpa kategori'}`;
  const msg = `${what}\n${fmtLong(t.date)}\n\n` +
    (t.pending ? 'Transaksi ini belum terkirim dan akan dibuang dari antrean.' : `Baris ${t.row} di sheet ${t.type === 'tf' ? 'Transfer' : sheetName(t.type)} akan dihapus permanen.`);
  const ok = await confirmDlg({ title: t.pending ? 'Buang transaksi?' : 'Hapus transaksi?', msg, ok: t.pending ? 'Buang' : 'Hapus' });
  if (!ok) return;
  if (t.pending) {
    Queue.remove(t.cid); invalidate(); closeSheet(); renderCurrent();
    toast('Dibuang dari antrean', 'success');
    return;
  }
  const btn = $('#detailActions [data-action="del"]');
  btn.disabled = true; btn.innerHTML = '<span class="spinner" style="border-color:rgba(220,47,69,.3);border-top-color:var(--danger)"></span>Menghapus…';
  try {
    const res = await Api.call('delete', { type: t.type, row: t.row, fp: t.fp });
    setServerData(res);
    closeSheet();
    renderCurrent();
    toast('Transaksi dihapus', 'success', { action: 'Batalkan', onAction: () => undoDelete(t) });
  } catch (e) {
    handleWriteError(e, false);
    if (btn.isConnected) { btn.disabled = false; btn.innerHTML = `${icon('trash')}Hapus`; }
  }
}

function undoDelete(t) {
  Queue.push(t.type === 'tf'
    ? { cid: Util.uid(), at: Date.now(), type: 'tf', date: t.date, amount: t.amount, from: t.from, to: t.to, note: t.note }
    : { cid: Util.uid(), at: Date.now(), type: t.type, date: t.date, amount: t.amount, category: t.category, note: t.note, account: t.account || '' });
  invalidate(); renderCurrent();
  flushQueue({ announce: true });
}

/* =====================================================================
   PERIODE KUSTOM (dipakai dasbor & filter riwayat)
   ===================================================================== */
let periodMode = 'period';

function openPeriod(mode) {
  periodMode = mode;
  const t = today();
  const firstOfMonth = t.slice(0, 8) + '01';
  const lmEnd = addDays(firstOfMonth, -1);
  const presets = [
    ['7 hari terakhir', addDays(t, -6), t],
    ['30 hari terakhir', addDays(t, -29), t],
    ['Bulan lalu', lmEnd.slice(0, 8) + '01', lmEnd],
    ['3 bulan terakhir', addDays(t, -89), t],
    ['Tahun ini', t.slice(0, 4) + '-01-01', t]
  ];
  if (mode === 'hist') presets.push(['Semua waktu', '', '']);
  const cur = mode === 'hist' ? S.hist : S.ui.period;
  $('#presetList').innerHTML = presets.map(([l, a, b]) =>
    `<button type="button" data-from="${a}" data-to="${b}" class="${cur.from === a && cur.to === b && (mode === 'hist' || cur.type === 'custom') ? 'on' : ''}">${l}</button>`).join('');
  $('#rangeFrom').value = cur.from || addDays(t, -29);
  $('#rangeTo').value = cur.to || t;
  $('#rangeErr').textContent = '';
  $('#periodTitle').textContent = mode === 'hist' ? 'Filter Tanggal' : 'Pilih Periode';
  openSheet('sheetPeriod');
}

function applyPeriod(from, to) {
  if (from && to && from > to) { $('#rangeErr').textContent = 'Tanggal awal harus sebelum tanggal akhir.'; return; }
  if (periodMode === 'hist') {
    S.hist.from = from; S.hist.to = to; S.hist.limit = 80;
  } else {
    if (!from || !to) return;
    S.ui.period = { type: 'custom', from, to }; saveUi();
  }
  closeSheet();
  renderCurrent();
}

/* =====================================================================
   PEMETAAN KOLOM
   ===================================================================== */
let mapKey = 'out';

function openMap(k) { mapKey = k; $('#mapTitle').textContent = 'Struktur Sheet'; renderMap(); openSheet('sheetMap'); }

function openChangePin() {
  $('#mapTitle').textContent = 'Ganti PIN';
  const f = (id, label) => `<label class="field"><span>${label}</span><input id="${id}" type="password" inputmode="numeric" maxlength="6" autocomplete="off" pattern="[0-9]*"></label>`;
  $('#mapBody').innerHTML = f('pinOld', 'PIN lama') + f('pinNew', 'PIN baru (6 angka)') + f('pinNew2', 'Ulangi PIN baru') +
    `<p class="field-err" id="pinErr"></p><button class="btn-primary block" data-action="pin-save" type="button">${icon('check')}Simpan PIN baru</button>`;
  openSheet('sheetMap');
}

async function saveNewPin() {
  const o = $('#pinOld').value; const n = $('#pinNew').value; const n2 = $('#pinNew2').value;
  const err = (m) => { $('#pinErr').textContent = m; };
  if (!/^\d{6}$/.test(o) || !/^\d{6}$/.test(n)) return err('PIN harus tepat 6 angka.');
  if (n !== n2) return err('PIN baru dan ulangannya tidak sama.');
  const weak = pinWeak(n); if (weak) return err(weak);
  const btn = $('#mapBody .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Menyimpan…';
  try {
    const res = await Api.call('changePin', { oldPin: o, newPin: n });
    S.cfg.token = res.token; Store.set('cfg', S.cfg);
    closeSheet();
    toast('PIN berhasil diganti', 'success');
  } catch (e) {
    if (e.code === 'AUTH') { closeSheet(); onAuthExpired(); return; }
    err(e.message);
    btn.disabled = false; btn.innerHTML = `${icon('check')}Simpan PIN baru`;
  }
}

function renderMap() {
  const st = S.meta && S.meta.structure && S.meta.structure[mapKey];
  if (!st) { $('#mapBody').innerHTML = '<p class="card-sub">Sinkronkan data dulu.</p>'; return; }
  const opts = (sel, none) => (none ? '<option value="0">— Tidak dipakai —</option>' : '<option value="0" disabled>Pilih kolom…</option>') +
    st.headers.map((h, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${colLetter(i + 1)} · ${esc(h || '(tanpa judul)')}</option>`).join('');
  $('#mapBody').innerHTML = `
    <div class="seg" style="margin-bottom:16px;--n:2;--i:${mapKey === 'in' ? 1 : 0}" data-type="${mapKey}"><span class="seg-ind"></span>
      <button type="button" data-mapkey="out" aria-checked="${mapKey === 'out'}">Pengeluaran</button>
      <button type="button" data-mapkey="in" aria-checked="${mapKey === 'in'}">Pemasukan</button></div>
    <label class="field"><span>Baris header (judul kolom)</span><input id="mHeader" type="number" min="1" inputmode="numeric" value="${st.headerRow}"></label>
    <label class="field"><span>Tanggal *</span><select id="mDate">${opts(st.date, false)}</select></label>
    <label class="field"><span>Nominal *</span><select id="mAmount">${opts(st.amount, false)}</select></label>
    <label class="field"><span>Kategori</span><select id="mCategory">${opts(st.category, true)}</select></label>
    <label class="field"><span>Catatan</span><select id="mNote">${opts(st.note, true)}</select></label>
    <label class="field"><span>Akun (sumber dana)</span><select id="mAccount">${opts(st.account || 0, true)}</select></label>
    <div class="note-warn" style="margin:0 0 14px">${icon('info')}<span>Aplikasi hanya menulis ke kolom di atas. Kolom lain tidak disentuh; kolom berisi rumus disalin otomatis ke baris baru.</span></div>
    <p class="field-err" id="mapErr"></p>
    <button class="btn-primary block" data-action="map-save" type="button">${icon('check')}Simpan pemetaan</button>
    ${st.source === 'manual' ? '<button class="btn-soft" style="width:100%;margin-top:10px" data-action="map-reset" type="button">Kembalikan ke deteksi otomatis</button>' : ''}`;
}

async function saveMap(reset) {
  const btn = $('#mapBody .btn-primary');
  let payload;
  if (reset) payload = ['resetMapping', { key: mapKey }];
  else {
    const map = { headerRow: +$('#mHeader').value, date: +$('#mDate').value, amount: +$('#mAmount').value, category: +$('#mCategory').value, note: +$('#mNote').value, account: +$('#mAccount').value };
    const cols = [map.date, map.amount, map.category, map.note, map.account].filter((x) => x > 0);
    if (!(map.headerRow >= 1) || !map.date || !map.amount) { $('#mapErr').textContent = 'Kolom Tanggal dan Nominal wajib dipilih.'; return; }
    if (new Set(cols).size !== cols.length) { $('#mapErr').textContent = 'Satu kolom tidak boleh dipakai untuk dua isian.'; return; }
    payload = ['saveMapping', { key: mapKey, map }];
  }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Menyimpan…';
  try {
    setServerData(await Api.call(payload[0], payload[1]));
    closeSheet(); renderCurrent();
    toast('Struktur sheet diperbarui', 'success');
  } catch (e) {
    if (e.code === 'AUTH') { closeSheet(); onAuthExpired(); return; }
    $('#mapErr').textContent = e.message;
    btn.disabled = false; btn.innerHTML = `${icon('check')}Simpan pemetaan`;
  }
}

/* =====================================================================
   LAYAR MASUK (PIN)
   ===================================================================== */
const A = { pin: '', busy: false, mode: 'setup' };

function showAuth(msg) {
  while (sheetStack.length) closeSheet(true);
  $('#main').hidden = true;
  $('#auth').hidden = false;
  const hasApi = !!S.cfg.api;
  A.mode = hasApi ? 'lock' : 'setup';
  A.pin = ''; A.busy = false;
  $('#urlField').hidden = hasApi;
  $('#changeServerBtn').hidden = !hasApi;
  $('#demoBtn').hidden = hasApi;
  $('#authSub').textContent = hasApi ? 'Masukkan PIN untuk membuka' : 'Hubungkan ke spreadsheet-mu';
  $('#pinLabel').textContent = hasApi ? 'Masukkan PIN' : 'PIN 6 angka (yang kamu atur di spreadsheet)';
  $('#authMsg').textContent = msg || '';
  renderPin();
  if (window.DOMPET_GAS) {
    $('#urlField').hidden = true; $('#changeServerBtn').hidden = true; $('#demoBtn').hidden = true;
    A.busy = true; renderPin();
    Api.call('ping', {}, { token: '' })
      .then((r) => { A.busy = false; if (!r.pinSet) setCreateMode(); else renderPin(); })
      .catch((e) => { A.busy = false; renderPin(); $('#authMsg').textContent = e.message; });
  }
}

/** Pertama kali dibuka (versi satu file): buat PIN langsung di HP */
function setCreateMode(msg) {
  A.mode = 'create'; A.first = null; A.pin = '';
  $('#authSub').textContent = 'Selamat datang! Buat PIN untuk mengamankan datamu';
  $('#pinLabel').textContent = 'Buat PIN 6 angka';
  $('#authMsg').textContent = msg || '';
  renderPin();
}

function pinWeak(pin) {
  if (/^(\d)\1{5}$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin)) return 'PIN terlalu mudah ditebak. Pilih kombinasi lain.';
  return '';
}

function renderPin() {
  $$('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < A.pin.length));
  $('#pinDots').classList.toggle('busy', A.busy);
}

function pinError(msg) {
  $('#authMsg').textContent = msg;
  const d = $('#pinDots');
  d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
  haptic(60);
  A.pin = ''; renderPin();
}

function pinKey(k) {
  if (A.busy) return;
  if (k === 'back') A.pin = A.pin.slice(0, -1);
  else if (A.pin.length < 6) A.pin += k;
  $('#authMsg').textContent = '';
  renderPin();
  haptic(6);
  if (A.pin.length === 6) submitPin();
}

function validApiUrl(u) {
  return /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec\/?$/.test(u);
}

async function submitPin() {
  if (A.mode === 'create') return submitCreatePin();
  let api = S.cfg.api;
  if (A.mode === 'setup') {
    api = $('#apiUrl').value.trim();
    if (!api) return pinError('Tempel dulu URL Aplikasi Web dari Apps Script.');
    if (/\/dev\/?$/.test(api)) return pinError('Gunakan URL yang berakhiran /exec (bukan /dev).');
    if (!validApiUrl(api)) return pinError('URL tidak dikenali. Contoh: https://script.google.com/macros/s/…/exec');
  }
  A.busy = true; renderPin();
  try {
    if (A.mode === 'setup') {
      const ping = await Api.call('ping', {}, { api, token: '' });
      if (ping.app !== 'dompet') throw new ApiError('URL ini bukan server Dompet.', 'BAD_RESPONSE');
      if (!ping.pinSet) throw new ApiError('PIN belum diatur. Di spreadsheet buka menu 💰 Dompet → Atur / ganti PIN.', 'NO_PIN');
    }
    const res = await Api.call('login', { pin: A.pin }, { api, token: '' });
    if (S.cfg.api && S.cfg.api !== api) { Store.del('cache'); S.data = { in: [], out: [] }; S.meta = null; }
    S.cfg = Object.assign({}, S.cfg, { api, token: res.token, demo: false });
    Store.set('cfg', S.cfg);
    A.busy = false;
    enterApp();
  } catch (e) {
    A.busy = false;
    if (e.code === 'NO_PIN' && window.DOMPET_GAS) { setCreateMode(); return; }
    pinError(e.message);
  }
}

async function submitCreatePin() {
  if (!A.first) {
    const weak = pinWeak(A.pin);
    if (weak) return pinError(weak);
    A.first = A.pin; A.pin = '';
    $('#pinLabel').textContent = 'Ketik ulang PIN yang sama';
    renderPin();
    return;
  }
  if (A.pin !== A.first) { A.first = null; $('#pinLabel').textContent = 'Buat PIN 6 angka'; return pinError('PIN tidak sama. Ulangi dari awal.'); }
  A.busy = true; renderPin();
  try {
    const res = await Api.call('setPin', { pin: A.pin }, { token: '' });
    S.cfg = Object.assign({}, S.cfg, { token: res.token, demo: false });
    Store.set('cfg', S.cfg);
    A.busy = false;
    enterApp();
    setTimeout(() => toast('PIN dibuat. Aplikasi siap dipakai!', 'success'), 400);
  } catch (e) {
    A.busy = false;
    if (e.code === 'PIN_EXISTS') { showAuth(e.message); return; }
    A.first = null; $('#pinLabel').textContent = 'Buat PIN 6 angka';
    pinError(e.message);
  }
}

function startDemo() {
  Demo.reset();
  Store.del('cache'); Store.del('queue');
  S.cfg = { demo: true, name: S.cfg.name || '' };
  Store.set('cfg', S.cfg);
  S.data = { in: [], out: [] }; S.meta = null; S.loaded = false; S.lastHero = null;
  invalidate();
  enterApp();
}

function exitDemo() {
  Demo.reset();
  Store.del('cache'); Store.del('queue');
  S.cfg = { name: S.cfg.name || '' };
  Store.set('cfg', S.cfg);
  S.data = { in: [], out: [] }; S.meta = null; S.loaded = false; S.lastSync = 0; S.lastHero = null;
  invalidate();
  showAuth();
}

async function lockApp() {
  try { await Api.call('logout', {}, { timeout: 6000 }); } catch (e) { /* tetap kunci walau offline */ }
  S.cfg.token = null; Store.set('cfg', S.cfg);
  showAuth();
}

async function disconnectDevice() {
  const pending = Queue.all().length;
  const ok = await confirmDlg({
    title: 'Putuskan perangkat ini?',
    msg: 'Alamat server, sesi, dan salinan data di HP ini akan dihapus. Data di spreadsheet tetap aman.' + (pending ? `\n\nPerhatian: ${pending} transaksi di antrean belum terkirim dan akan hilang.` : ''),
    ok: 'Putuskan', ic: 'logout'
  });
  if (!ok) return;
  try { await Api.call('logout', {}, { timeout: 6000 }); } catch (e) { /* abaikan */ }
  ['cfg', 'cache', 'queue', 'ui', 'demo_db'].forEach((k) => Store.del(k));
  if (window.DOMPET_GAS) {
    S.cfg = { api: 'gas' }; Store.set('cfg', S.cfg);
    S.data = { in: [], out: [] }; S.meta = null; S.loaded = false; S.lastSync = 0; S.lastHero = null;
    invalidate();
    showAuth();
    return;
  }
  location.reload();
}

/* =====================================================================
   PASANG (INSTALL) PWA
   ===================================================================== */
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  if (!$('#main').hidden && (S.tab === 'home' || S.tab === 'settings')) renderCurrent();
});
window.addEventListener('appinstalled', () => { installEvt = null; toast('Dompet terpasang di layar utama', 'success'); renderCurrent(); });

async function doInstall() {
  if (!installEvt) { toast('Buka menu ⋮ di Chrome lalu pilih "Instal aplikasi" / "Tambahkan ke layar utama".', 'info', { duration: 5000 }); return; }
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) { /* abaikan */ }
  installEvt = null;
  renderCurrent();
}

/* =====================================================================
   EVENT
   ===================================================================== */
function bindEvents() {
  // Navigasi bawah
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#fab').addEventListener('click', () => { haptic(8); openAdd(); });
  $('#syncPill').addEventListener('click', () => sync());
  $('#scrim').addEventListener('click', () => closeSheet());
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet()));
  $$('.sheet').forEach(enableSwipe);

  // Delegasi klik global
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-tx],[data-p],[data-goto],[data-action],[data-htype],[data-trend],[data-map],[data-mapkey],[data-cat],[data-from],[data-accpick],[data-tffrom],[data-tfto]');
    if (!el) return;
    if (el.dataset.tx) return openDetail(el.dataset.tx);
    if (el.dataset.p) {
      if (el.dataset.p === 'custom') return openPeriod('period');
      S.ui.period = { type: el.dataset.p }; saveUi(); return renderCurrent();
    }
    if (el.dataset.goto === 'history-none') { S.hist = { q: '', type: 'all', cat: '', acc: '__none__', from: '', to: '', limit: 80 }; $('#histSearch').value = ''; return switchTab('history'); }
    if (el.dataset.goto) return switchTab(el.dataset.goto);
    if (el.dataset.htype) { S.hist.type = el.dataset.htype; S.hist.cat = ''; S.hist.limit = 80; return renderHistory(); }
    if (el.dataset.trend) { S.ui.trend = el.dataset.trend; saveUi(); return renderStats(); }
    if (el.dataset.map) return openMap(el.dataset.map);
    if (el.dataset.mapkey) { mapKey = el.dataset.mapkey; return renderMap(); }
    if (el.dataset.accpick !== undefined) { F.account = F.account === el.dataset.accpick ? '' : el.dataset.accpick; haptic(6); return renderAccChips(); }
    if (el.dataset.tffrom !== undefined) { F.from = el.dataset.tffrom; if (F.to === F.from) F.to = ''; haptic(6); return renderTfChips(); }
    if (el.dataset.tfto !== undefined) { F.to = el.dataset.tfto; if (F.from === F.to) F.from = ''; haptic(6); return renderTfChips(); }
    if (el.dataset.cat !== undefined && el.closest('#catChips')) {
      F.category = F.category === el.dataset.cat ? '' : el.dataset.cat;
      $('#addErr').textContent = '';
      haptic(6);
      return renderChips();
    }
    if (el.dataset.from !== undefined && el.closest('#presetList')) return applyPeriod(el.dataset.from, el.dataset.to);
    switch (el.dataset.action) {
      case 'add': return openAdd();
      case 'sync': return sync();
      case 'flush': Queue.save(Queue.all().map((t) => Object.assign({}, t, { error: null }))); invalidate(); return flushQueue({ announce: true });
      case 'hist-more': S.hist.limit += 80; return renderHistory();
      case 'hist-date': return openPeriod('hist');
      case 'hist-reset': S.hist = { q: '', type: 'all', cat: '', acc: '', from: '', to: '', limit: 80 }; $('#histSearch').value = ''; return renderHistory();
      case 'cat-more': F.expanded = !F.expanded; return renderChips();
      case 'cat-new': F.newCat = true; return renderChips();
      case 'cat-add': return addNewCategory(($('#newCatInput') || {}).value || '');
      case 'del': return deleteCurrent();
      case 'edit': { const t = findTx(detailId); if (t) openAdd({ tx: t, replace: true }); return; }
      case 'map-save': return saveMap(false);
      case 'map-reset': return saveMap(true);
      case 'lock': return lockApp();
      case 'hard-reload': return hardReload();
      case 'change-pin': return openChangePin();
      case 'pin-save': return saveNewPin();
      case 'disconnect': return disconnectDevice();
      case 'exit-demo': return exitDemo();
      case 'install': return doInstall();
      case 'install-dismiss': S.ui.installDismissed = true; saveUi(); return renderCurrent();
      default: return undefined;
    }
  });

  // Riwayat: pencarian & filter kategori
  let searchT;
  $('#histSearch').addEventListener('input', (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { S.hist.q = e.target.value; S.hist.limit = 80; renderHistory(); }, 160);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'histCat') { S.hist.cat = e.target.value; S.hist.limit = 80; renderHistory(); }
    if (e.target.id === 'histAcc') { S.hist.acc = e.target.value; S.hist.limit = 80; renderHistory(); }
    if (e.target.id === 'nameInput') { S.cfg.name = e.target.value.trim().slice(0, 24); Store.set('cfg', S.cfg); toast('Nama tersimpan', 'success'); }
  });

  // Form tambah
  $('#amountPad').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pressKey(b.dataset.k); });
  $('#typeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.type === F.type) return;
    F.type = b.dataset.type;
    if (F.category && !categories(F.type).includes(F.category)) F.category = '';
    if (F.type !== 'tf' && F.mode === 'add') F.account = defaultAccount(F.type);
    F.expanded = false; F.newCat = false;
    haptic(6);
    renderForm();
  });
  $('#dateInput').addEventListener('change', (e) => { if (e.target.value) { F.date = e.target.value; renderDate(); } });
  $('#dateChip').addEventListener('click', (e) => {
    const inp = $('#dateInput');
    if (e.target !== inp && inp.showPicker) { e.preventDefault(); try { inp.showPicker(); } catch (err) { inp.focus(); } }
  });
  $('#dateQuick').addEventListener('click', () => { const t = today(); F.date = F.date === t ? addDays(t, -1) : t; renderDate(); haptic(6); });
  $('#saveBtn').addEventListener('click', saveForm);
  $('#noteInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  $('#catChips').addEventListener('keydown', (e) => {
    if (e.target.id === 'newCatInput' && e.key === 'Enter') { e.preventDefault(); addNewCategory(e.target.value); }
    if (e.target.id === 'newCatInput' && e.key === 'Escape') { F.newCat = false; renderChips(); }
  });

  // Keyboard fisik (laptop) saat form terbuka
  document.addEventListener('keydown', (e) => {
    if (sheetStack[sheetStack.length - 1] !== 'sheetAdd') return;
    if (e.target.matches('input, select, textarea')) return;
    if (/^\d$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { pressKey('back'); e.preventDefault(); }
    else if (e.key === 'Enter') { saveForm(); e.preventDefault(); }
  });

  // Periode kustom
  $('#rangeApply').addEventListener('click', () => applyPeriod($('#rangeFrom').value, $('#rangeTo').value));

  // Layar PIN
  $('#pinPad').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pinKey(b.dataset.k); });
  document.addEventListener('keydown', (e) => {
    if ($('#auth').hidden || e.target.matches('input')) return;
    if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('back');
  });
  $('#pasteBtn').addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); if (t) $('#apiUrl').value = t.trim(); }
    catch (e) { $('#apiUrl').focus(); toast('Tekan lama kolom URL lalu pilih Tempel.', 'info'); }
  });
  $('#demoBtn').addEventListener('click', startDemo);
  $('#changeServerBtn').addEventListener('click', async () => {
    const ok = await confirmDlg({ title: 'Ganti alamat server?', msg: 'Kamu perlu menempelkan URL Aplikasi Web yang baru dan memasukkan PIN.', ok: 'Ganti', ic: 'refresh' });
    if (!ok) return;
    S.cfg.api = null; S.cfg.token = null; Store.set('cfg', S.cfg);
    showAuth();
  });
  $('#exitDemoBtn').addEventListener('click', exitDemo);

  // Koneksi & siklus hidup
  window.addEventListener('online', () => { if (!$('#main').hidden) (Queue.sendable().length ? flushQueue({ announce: true }) : sync()); });
  window.addEventListener('offline', () => { if (!$('#main').hidden) setSync('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || $('#main').hidden) return;
    if (Queue.sendable().length) flushQueue();
    else if (Date.now() - S.lastSync > 60000) sync();
    else renderCurrent();
  });
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.tab === 'stats' && !$('#main').hidden) renderStats(); }, 200); });
}

/* =====================================================================
   MULAI
   ===================================================================== */
function enterApp() {
  $('#auth').hidden = true;
  $('#main').hidden = false;
  $('#demoBanner').hidden = !S.cfg.demo;
  loadCache();
  S.loaded = S.lastSync > 0;
  S.tab = '';
  switchTab('home');
  const params = new URLSearchParams(location.search);
  const add = params.get('add');
  if (add) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* abaikan */ } }
  if (add === 'in' || add === 'out') setTimeout(() => openAdd({ type: add }), 60);
  sync();
}

function boot() {
  if (!window.DOMPET_PREVIEW && !window.DOMPET_GAS) {
    const mm = versionMismatch();
    if (mm) {
      let tried = false;
      try { tried = sessionStorage.getItem('dompet.vfix') === '1'; sessionStorage.setItem('dompet.vfix', '1'); } catch (e) { tried = true; }
      console.warn('Versi file tidak sama:', mm.join(' / '));
      if (!tried) { hardReload(); return; }
    }
  }
  if (window.DOMPET_GAS && (S.cfg.api !== 'gas' || S.cfg.demo)) {
    S.cfg = Object.assign({}, S.cfg, { api: 'gas', demo: false });
    Store.set('cfg', S.cfg);
  }
  bindEvents();
  setupServiceWorker();
  if (window.DOMPET_PREVIEW && !S.cfg.demo) { startDemo(); return; }   // hanya untuk halaman pratinjau
  if (S.cfg.demo || (S.cfg.api && S.cfg.token)) enterApp();
  else showAuth();
}

// Mulai setelah semua skrip (termasuk assets.js) selesai dimuat
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else setTimeout(boot, 0);
