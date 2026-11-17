/* =====================================================================
   DOMPET · assets.js — tab Aset: Dana (akun), Transfer, Emas
   ===================================================================== */
'use strict';

const ASSETS_JS_VERSION = '1.1.1';

const ACC_TYPES = ['Tunai', 'Bank', 'E-wallet', 'Lainnya'];
const GOLD_TYPES = ['Antam', 'UBS', 'Galeri24', 'Lotus Archi', 'Perhiasan', 'Emas digital'];
const GOLD_PURITY = ['24K (999,9)', '23K', '22K', '18K', '17K', '16K'];
const GOLD_STORAGE = ['Brankas rumah', 'Safe deposit box', 'Aplikasi/digital', 'Dipakai'];
const GOLD_COLOR = '#eda100';

const accIcon = (type) => ({ Tunai: 'cash', Bank: 'bank', 'E-wallet': 'phone' }[type] || 'wallet');
const fmtGram = (g) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(g || 0);
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

function activeAccounts() { return S.assets.accounts.filter((a) => a.status !== 'Arsip'); }

/** Akun default untuk beli/jual emas: terakhir dipakai, atau rekening bank pertama */
function goldAccount(kind) {
  const accs = activeAccounts();
  const last = (S.ui.lastAccount || {})[kind];
  if (accs.some((a) => a.name === last)) return last;
  const bank = accs.find((a) => a.type === 'Bank');
  return bank ? bank.name : (accs[0] ? accs[0].name : '');
}
function rememberAccount(kind, name) {
  if (!name) return;
  S.ui.lastAccount = Object.assign({}, S.ui.lastAccount, { [kind]: name });
  saveUi();
}

/* ---------- Perhitungan ---------- */

/** Saldo tiap akun = saldo awal + transaksi bertanda akun itu sejak tanggal saldo awal ± transfer */
function balances() {
  if (memo.bal) return memo.bal;
  const map = {};
  S.assets.accounts.forEach((a) => { map[a.name] = Object.assign({}, a, { bal: a.opening, inc: 0, out: 0, tin: 0, tout: 0 }); });
  const start = S.assets.accounts.reduce((m, a) => (a.openingDate && (!m || a.openingDate < m) ? a.openingDate : m), '');
  const counts = (a, date) => !a.openingDate || date >= a.openingDate;
  let unassigned = 0; let unassignedSum = 0;
  allTx().forEach((t) => {
    if (t.error) return;
    const a = t.account ? map[t.account] : null;
    if (!a) {
      if (!t.account && start && t.date >= start) { unassigned++; unassignedSum += t.amount; }
      return;
    }
    if (!counts(a, t.date)) return;
    if (t.type === 'in') { a.bal += t.amount; a.inc += t.amount; } else { a.bal -= t.amount; a.out += t.amount; }
  });
  allTransfers().forEach((t) => {
    if (t.error) return;
    const f = map[t.from]; const g = map[t.to];
    if (f && counts(f, t.date)) { f.bal -= t.amount; f.tout += t.amount; }
    if (g && counts(g, t.date)) { g.bal += t.amount; g.tin += t.amount; }
  });
  const list = Object.keys(map).map((k) => map[k]);
  memo.bal = { map, list, total: list.reduce((s, a) => s + a.bal, 0), start, unassigned, unassignedSum };
  return memo.bal;
}

function latestPrice(type) {
  const t = String(type || '').toLowerCase();
  const ps = S.assets.prices.filter((p) => p.type.toLowerCase() === t);
  return ps.length ? ps[ps.length - 1] : null;
}

function goldCalc() {
  if (memo.gold) return memo.gold;
  const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const held = S.assets.gold.filter((g) => g.status !== 'Dijual').sort(byDate);
  const sold = S.assets.gold.filter((g) => g.status === 'Dijual').sort((a, b) => (a.soldDate < b.soldDate ? 1 : -1));
  const types = {};
  let grams = 0; let cost = 0; let value = 0; let pricedCost = 0; let valueOrCost = 0;
  const missing = new Set();
  held.forEach((g) => {
    const p = latestPrice(g.type);
    const t = types[g.type] || (types[g.type] = { type: g.type, grams: 0, cost: 0, value: 0, price: p });
    t.grams += g.grams; t.cost += g.total; grams += g.grams; cost += g.total;
    if (p) { const v = g.grams * p.price; t.value += v; value += v; pricedCost += g.total; valueOrCost += v; }
    else { missing.add(g.type); valueOrCost += g.total; }
  });
  const realized = sold.reduce((s, g) => s + (g.soldTotal - g.total), 0);
  memo.gold = {
    held, sold, byType: Object.keys(types).map((k) => types[k]).sort((a, b) => b.grams - a.grams),
    grams, cost, value, pricedCost, pl: value - pricedCost, plPct: pricedCost ? ((value - pricedCost) / pricedCost) * 100 : 0,
    missing: Array.from(missing), valueOrCost, realized
  };
  return memo.gold;
}

function plText(pl, pct) {
  const good = pl >= 0;
  return `<span class="delta ${good ? 'good' : 'bad'}">${icon(good ? 'up' : 'down')}${good ? '+' : '−'}${rp(pl)}${pct !== undefined && isFinite(pct) ? ` · ${Math.abs(pct).toFixed(1).replace('.', ',')}%` : ''}</span>`;
}

/* ---------- Kartu di Beranda ---------- */
function assetHomeCard() {
  const has = S.assets.accounts.length || S.assets.gold.length;
  if (!has) {
    if (S.ui.assetPromoDismissed || !S.loaded || S.cfg.demo) return '';
    return `<div class="card promo"><span class="tx-ico gold">${icon('coins')}</span>
      <div style="flex:1"><b style="font-size:14px">Baru: saldo akun & emas</b><div class="card-sub">Lihat uangmu ada di mana saja dan nilai emasmu, langsung dari spreadsheet.</div></div>
      <button class="btn-soft sm" data-goto="assets" type="button">Mulai</button>
      <button class="icon-btn" data-a="promo-dismiss" type="button" aria-label="Tutup" style="width:32px;height:32px">${icon('x')}</button></div>`;
  }
  const b = balances(); const g = goldCalc();
  return `<button class="card asset-card" data-goto="assets" type="button">
    <div class="card-head"><h3 class="card-title">Total aset</h3><span class="card-link">Detail${icon('chev-r')}</span></div>
    <div class="asset-total num">${rpNet(b.total + g.valueOrCost)}</div>
    <div class="asset-split">
      <span>${icon('wallet')}Dana <b class="num">${rpNet(b.total)}</b></span>
      <span>${icon('gold')}Emas <b class="num">${rp(g.valueOrCost)}</b>${g.grams ? ` · ${fmtGram(g.grams)} g` : ''}</span>
    </div></button>`;
}

/* ---------- Tab Aset ---------- */
/** Kode Apps Script lama (v1.0) belum punya fitur Aset */
function serverTooOld() {
  const v = S.meta && S.meta.version;
  if (!v || S.cfg.demo) return false;
  const [a, b] = String(v).split('.').map(Number);
  return a < 1 || (a === 1 && b < 1);
}

function renderAssets() {
  const body = $('#assetsBody');
  if (!S.loaded && !S.assets.accounts.length && !S.assets.gold.length) { body.innerHTML = skeleton(); return; }
  if (serverTooOld()) {
    body.innerHTML = `<div class="card empty"><div class="empty-art">${icon('info')}</div><h3>Perbarui kode Apps Script</h3>
      <p>Tampilan sudah versi ${esc(APP_VERSION)}, tetapi kode Apps Script di spreadsheetmu masih versi ${esc(S.meta.version)}. Fitur Dana &amp; Emas butuh kode versi 1.1.</p>
      <p class="card-sub" style="margin-top:10px">Buka spreadsheet → Ekstensi → Apps Script → ganti semua isi Code.gs dengan kode baru → Simpan → Terapkan → Kelola deployment → ✏️ → Versi: <b>Versi baru</b> → Terapkan. Lalu tutup dan buka ulang aplikasi ini.</p></div>`;
    return;
  }
  const b = balances(); const g = goldCalc();
  const tab = S.ui.assetTab === 'emas' ? 'emas' : 'dana';
  let html = `<div class="hero hero-asset">
      <p class="hero-label">Total aset</p>
      <div class="hero-value num">${rpNet(b.total + g.valueOrCost)}</div>
      <div class="hero-split">
        <button class="hero-stat" data-a="tab:dana" type="button"><div class="top"><span class="bub dana">${icon('wallet')}</span><small>Dana · ${activeAccounts().length} akun</small></div><b class="num">${rpNet(b.total)}</b></button>
        <button class="hero-stat" data-a="tab:emas" type="button"><div class="top"><span class="bub emas">${icon('gold')}</span><small>Emas · ${fmtGram(g.grams)} g</small></div><b class="num">${rp(g.valueOrCost)}</b></button>
      </div>
      ${g.missing.length ? `<div class="hero-note">${icon('info')}<span>Nilai ${esc(g.missing.join(', '))} masih memakai harga beli. Isi harga buyback di tab Emas.</span></div>` : ''}
    </div>
    <div class="seg asset-seg" style="--n:2;--i:${tab === 'emas' ? 1 : 0}" data-type="${tab}"><span class="seg-ind"></span>
      <button type="button" data-a="tab:dana" aria-checked="${tab === 'dana'}">Dana</button>
      <button type="button" data-a="tab:emas" aria-checked="${tab === 'emas'}">Emas</button></div>`;
  html += tab === 'dana' ? danaView(b) : emasView(g);
  body.innerHTML = html;

  if (tab === 'dana' && $('#danaComp')) {
    const items = b.list.filter((a) => a.status !== 'Arsip' && a.bal > 0).sort((x, y) => y.bal - x.bal);
    const top = items.slice(0, 6).map((a, i) => ({ label: a.name, value: a.bal, color: Charts.palette[i] }));
    const rest = items.slice(6).reduce((s, a) => s + a.bal, 0);
    if (rest > 0) top.push({ label: 'Lainnya', value: rest, color: Charts.other });
    Charts.segBar($('#danaComp'), top, rp);
  }
  if (tab === 'emas' && $('#goldTypes')) {
    Charts.rankBars($('#goldTypes'), g.byType.map((t) => ({
      label: t.type, value: t.grams, color: GOLD_COLOR,
      sub: `Modal ${rp(t.cost)}${t.price ? ` · nilai ${rp(t.value)}` : ''}`
    })), (v) => fmtGram(v) + ' g');
  }
}

function accRow(a) {
  return `<button class="tx" data-a="acc:${esc(a.name)}" type="button">
    <span class="tx-ico acc">${icon(accIcon(a.type))}</span>
    <span class="tx-main"><span class="tx-cat">${esc(a.name)}</span><span class="tx-note">${esc(a.type)}${a.openingDate ? ' · sejak ' + esc(fmtDM(a.openingDate)) : ''}</span></span>
    <span class="tx-amt ${a.bal < 0 ? 'neg' : ''}">${rpNet(a.bal)}</span></button>`;
}

function danaView(b) {
  if (!b.list.length) {
    return `<div class="card empty"><div class="empty-art">${icon('wallet')}</div><h3>Catat di mana uangmu berada</h3>
      <p>Tambahkan akun seperti Tunai, rekening bank, atau e-wallet beserta saldonya saat ini. Setelah itu, setiap transaksi otomatis memperbarui saldo akunnya.</p>
      <button class="btn-primary" data-a="acc-new" type="button">${icon('plus')}Tambah akun pertama</button></div>`;
  }
  const active = b.list.filter((a) => a.status !== 'Arsip').sort((x, y) => y.bal - x.bal);
  const arch = b.list.filter((a) => a.status === 'Arsip');
  let html = `<div class="action-row"><button class="btn-soft" data-a="acc-new" type="button">${icon('plus')}Akun</button>
    ${active.length >= 2 ? `<button class="btn-soft" data-a="tf-new" type="button">${icon('swap')}Transfer</button>` : ''}</div>`;
  if (b.unassigned) {
    html += `<button class="note-warn as-btn" data-goto="history-none" type="button">${icon('info')}<span>${b.unassigned} transaksi sejak ${esc(fmtDM(b.start))} belum punya akun (${rp(b.unassignedSum)}), jadi tidak memengaruhi saldo. Ketuk untuk melihat.</span></button>`;
  }
  html += `<div class="tx-card">${active.map(accRow).join('')}</div>`;
  if (active.filter((a) => a.bal > 0).length > 1) {
    html += `<div class="card" style="margin-top:14px"><div class="card-head"><h3 class="card-title">Komposisi dana</h3></div><div id="danaComp"></div></div>`;
  }
  if (arch.length) html += `<p class="mini-label" style="margin:16px 4px 8px">Diarsipkan</p><div class="tx-card muted">${arch.map(accRow).join('')}</div>`;
  return html;
}

function goldRow(x) {
  const p = latestPrice(x.type);
  const sold = x.status === 'Dijual';
  const value = sold ? x.soldTotal : (p ? x.grams * p.price : x.total);
  const pl = sold ? x.soldTotal - x.total : (p ? value - x.total : null);
  const sub = sold ? `Dijual ${fmtShort(x.soldDate)} · modal ${rp(x.total)}` : [x.purity, fmtShort(x.date), x.place].filter(Boolean).join(' · ');
  return `<button class="tx" data-a="gold:${esc(x.id)}" type="button"><span class="tx-ico gold">${icon('gold')}</span>
    <span class="tx-main"><span class="tx-cat">${esc(x.type)} · ${fmtGram(x.grams)} g${sold ? '<span class="badge pending">Terjual</span>' : ''}</span><span class="tx-note">${esc(sub)}</span></span>
    <span class="tx-amt">${rp(value)}${pl !== null ? `<small class="${pl >= 0 ? 'pl-good' : 'pl-bad'}">${pl >= 0 ? '+' : '−'}${rp(pl)}</small>` : '<small>harga beli</small>'}</span></button>`;
}

function emasView(g) {
  if (!S.assets.gold.length) {
    return `<div class="card empty"><div class="empty-art">${icon('gold')}</div><h3>Catat emas pertamamu</h3>
      <p>Simpan detail setiap pembelian: tanggal, berat, harga per gram, jenis, tempat beli, dan nomor sertifikat. Pembelian otomatis tercatat juga di Pengeluaran sebagai “${CAT_GOLD_BUY}”.</p>
      <button class="btn-primary" data-a="gold-new" type="button">${icon('plus')}Catat pembelian emas</button></div>`;
  }
  const types = uniq(g.held.map((x) => x.type));
  const priceRows = types.map((t) => {
    const p = latestPrice(t);
    return `<li><span>${esc(t)}</span><b>${p ? `${rp(p.price)}/g <small>· ${esc(fmtDM(p.date))}</small>` : '<small>belum diisi</small>'}</b></li>`;
  }).join('');
  let html = `<div class="card gold-sum">
      <div class="gold-big"><span class="num">${fmtGram(g.grams)}</span><small>gram emas dimiliki</small></div>
      <ul class="kv compact">
        <li><span>Modal (harga beli)</span><b class="num">${rp(g.cost)}</b></li>
        ${g.value ? `<li><span>Nilai buyback sekarang</span><b class="num">${rp(g.value)}</b></li><li><span>Untung/rugi${g.missing.length ? ' (yang ada harganya)' : ''}</span><b>${plText(g.pl, g.plPct)}</b></li>` : ''}
        ${g.grams ? `<li><span>Rata-rata harga beli</span><b class="num">${rp(Math.round(g.cost / g.grams))}/g</b></li>` : ''}
        ${g.sold.length ? `<li><span>Untung dari penjualan</span><b>${plText(g.realized)}</b></li>` : ''}
      </ul>
      ${types.length ? `<p class="mini-label" style="margin:14px 0 6px">Harga buyback terakhir</p><ul class="kv compact">${priceRows}</ul>` : ''}
      <div class="action-row" style="margin:14px 0 0"><button class="btn-soft" data-a="gold-new" type="button">${icon('plus')}Beli emas</button>
        <button class="btn-soft" data-a="price" type="button">${icon('refresh')}Perbarui harga</button></div>
    </div>`;
  if (g.byType.length > 1) html += `<div class="card"><div class="card-head"><h3 class="card-title">Per jenis</h3></div><div id="goldTypes"></div></div>`;
  html += `<p class="mini-label" style="margin:16px 4px 8px">Emas dimiliki (${g.held.length})</p>
    <div class="tx-card">${g.held.length ? g.held.map(goldRow).join('') : '<p class="card-sub" style="padding:14px">Semua emas sudah terjual.</p>'}</div>`;
  if (g.sold.length) {
    html += `<div class="center"><button class="link" data-a="toggle-sold" type="button">${S.ui.showSold ? 'Sembunyikan' : 'Tampilkan'} yang sudah dijual (${g.sold.length})</button></div>`;
    if (S.ui.showSold) html += `<div class="tx-card">${g.sold.map(goldRow).join('')}</div>`;
  }
  return html;
}

/* =====================================================================
   FORM GENERIK (lembar #sheetForm)
   ===================================================================== */
let formSubmit = null;
const FS = {};
const FS_OPT = {};
let sellTarget = null;   // emas yang sedang dijual (untuk pratinjau untung/rugi)

function openForm(title, html, onSubmit, submitLabel, opts = {}) {
  $('#formTitle').textContent = title;
  $('#formBody').innerHTML = html + '<p class="field-err" id="formErr" role="alert"></p>' +
    (onSubmit ? `<button class="btn-primary block" data-a="submit" type="button">${icon('check')}<span>${submitLabel || 'Simpan'}</span></button>` : '') +
    (opts.extra || '');
  formSubmit = onSubmit;
  openSheet('sheetForm', { replace: !!opts.replace });
  $('#sheetForm').scrollTop = 0;
}
const formErr = (m) => { const e = $('#formErr'); if (e) e.textContent = m; haptic(40); };
const fText = (id, label, val, ph, extra = '') => `<label class="field"><span>${label}</span><input class="inp" id="${id}" type="text" value="${esc(val || '')}" placeholder="${esc(ph || '')}" maxlength="120" autocomplete="off" ${extra}></label>`;
const fDate = (id, label, val) => `<label class="field"><span>${label}</span><input class="inp" id="${id}" type="date" value="${esc(val || today())}"></label>`;
const fMoney = (id, label, val, hint) => `<label class="field"><span>${label}</span><div class="inp-wrap"><b>Rp</b><input class="inp" id="${id}" inputmode="numeric" data-money value="${val ? NF.format(Math.round(val)) : ''}" placeholder="0" autocomplete="off"></div>${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;
const fGram = (id, label, val) => `<label class="field"><span>${label}</span><div class="inp-wrap"><input class="inp" id="${id}" inputmode="decimal" value="${val ? String(val).replace('.', ',') : ''}" placeholder="0" autocomplete="off"><b>gram</b></div></label>`;
const fNum = (id, label, val) => `<label class="field"><span>${label}</span><input class="inp" id="${id}" inputmode="numeric" value="${esc(val || '')}" placeholder="1" autocomplete="off"></label>`;
const fCheck = (id, label, on) => `<label class="check"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
const moneyVal = (id) => { const el = $('#' + id); return el ? Number(el.value.replace(/[^\d]/g, '')) || 0 : 0; };
function gramVal(id) {
  const el = $('#' + id); if (!el) return 0;
  let v = el.value.trim();
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}
const setMoney = (id, n) => { const el = $('#' + id); if (el) el.value = n > 0 ? NF.format(Math.round(n)) : ''; };

/** Pilihan berbentuk chip (+ "Lainnya" untuk isian bebas) */
function fPick(name, label, options, value, o = {}) {
  FS[name] = value || '';
  FS_OPT[name] = !!o.optional;
  const opts = uniq(options.concat(value && !options.includes(value) ? [value] : []));
  return `<div class="field"><span>${label}</span><div class="chips" data-group="${name}">` +
    opts.map((v) => `<button type="button" class="chip ${v === value ? 'on' : ''}" data-pick="${name}" data-val="${esc(v)}">${o.icon ? icon(o.icon(v)) : ''}${esc(v)}</button>`).join('') +
    (o.custom ? `<button type="button" class="chip ghost" data-pickcustom="${name}">${icon('plus')}Lainnya</button>` : '') +
    `</div>${o.custom ? `<input class="inp" id="pc-${name}" type="text" maxlength="40" placeholder="Ketik ${label.toLowerCase()} lain" hidden autocomplete="off">` : ''}${o.hint ? `<small class="hint">${o.hint}</small>` : ''}</div>`;
}
function pickVal(name) {
  const c = $('#pc-' + name);
  return c && !c.hidden && c.value.trim() ? c.value.trim() : (FS[name] || '');
}
const accTypeOf = (name) => { const a = S.assets.accounts.find((x) => x.name === name); return accIcon(a ? a.type : ''); };

/** Panggil server untuk aksi aset (butuh online), lalu perbarui tampilan */
async function assetCall(action, payload, okMsg, btn) {
  btn = btn || $('#formBody [data-a="submit"]');
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span><span>Menyimpan…</span>'; }
  try {
    const res = await Api.call(action, payload);
    setServerData(res);
    if (sheetStack.length) closeSheet();
    renderCurrent();
    if (okMsg) toast(okMsg, 'success');
    return res;
  } catch (e) {
    if (e.code === 'AUTH') { closeSheet(); onAuthExpired(); return null; }
    if (e.code === 'STALE') { closeSheet(); toast(e.message, 'warn', { duration: 4500 }); sync(); return null; }
    const m = e.code === 'NETWORK' ? 'Butuh koneksi internet. Coba lagi saat online.' : e.message;
    if ($('#formErr') && sheetStack[sheetStack.length - 1] === 'sheetForm') formErr(m); else toast(m, 'error', { duration: 5000 });
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    return null;
  }
}

/* ---------- Akun ---------- */
function openAccountForm(name) {
  const a = name ? S.assets.accounts.find((x) => x.name === name) : null;
  const html = fText('fAccName', 'Nama akun', a ? a.name : '', 'mis. BCA, Tunai, GoPay') +
    fPick('accType', 'Jenis', ACC_TYPES, a ? a.type : 'Bank', { icon: accIcon }) +
    fMoney('fAccOpen', a ? 'Saldo awal' : 'Saldo saat ini', a ? a.opening : 0, 'Transaksi yang dicatat sejak tanggal di bawah otomatis menambah atau mengurangi saldo ini.') +
    fDate('fAccDate', 'Saldo per tanggal', a ? a.openingDate : today()) +
    fText('fAccNote', 'Catatan (opsional)', a ? a.note : '', 'mis. rekening gaji') +
    (a ? fCheck('fAccArch', 'Arsipkan (sembunyikan dari pilihan akun)', a.status === 'Arsip') : '');
  openForm(a ? 'Edit Akun' : 'Tambah Akun', html, () => saveAccount(a), a ? 'Simpan perubahan' : 'Tambah akun', {
    replace: sheetStack.length > 0,
    extra: a ? `<button class="btn-outline-danger block mt" data-a="acc-del:${esc(a.name)}" type="button">${icon('trash')}Hapus akun</button>` : ''
  });
}

async function saveAccount(a) {
  const name = $('#fAccName').value.replace(/\s+/g, ' ').trim();
  if (!name) return formErr('Nama akun wajib diisi.');
  if (S.assets.accounts.some((x) => x.name.toLowerCase() === name.toLowerCase() && (!a || x.name !== a.name))) return formErr('Nama akun sudah dipakai.');
  const acc = {
    origName: a ? a.name : '', name, type: FS.accType || 'Lainnya', opening: moneyVal('fAccOpen'),
    openingDate: $('#fAccDate').value || today(), note: $('#fAccNote').value.trim(),
    archived: !!($('#fAccArch') && $('#fAccArch').checked)
  };
  await assetCall('accountSave', { acc }, a ? 'Akun diperbarui' : `Akun ${name} ditambahkan`);
}

function openAccountDetail(name) {
  const a = balances().map[name];
  if (!a) return;
  const entries = allEntries()
    .filter((t) => (t.type === 'tf' ? t.from === name || t.to === name : t.account === name))
    .filter((t) => !a.openingDate || t.date >= a.openingDate).slice(0, 30);
  const html = `<div class="detail-hero"><div class="tx-ico acc">${icon(accIcon(a.type))}</div>
      <div class="detail-amt ${a.bal < 0 ? 'neg' : ''}">${rpNet(a.bal)}</div>
      <div class="detail-type">${esc(a.type)}${a.status === 'Arsip' ? ' · diarsipkan' : ''}</div></div>
    <ul class="kv">
      <li><span>Saldo awal${a.openingDate ? ' (' + esc(fmtShort(a.openingDate)) + ')' : ''}</span><b>${rpNet(a.opening)}</b></li>
      <li><span>Pemasukan</span><b class="t-in">+${rp(a.inc)}</b></li>
      <li><span>Pengeluaran</span><b>−${rp(a.out)}</b></li>
      ${a.tin || a.tout ? `<li><span>Transfer masuk / keluar</span><b>+${rp(a.tin)} / −${rp(a.tout)}</b></li>` : ''}
      ${a.note ? `<li><span>Catatan</span><b>${esc(a.note)}</b></li>` : ''}
    </ul>
    <p class="mini-label" style="margin:16px 2px 6px">Mutasi terbaru</p>
    <div class="tx-card">${entries.length ? entries.map((t) => txItem(t, { showDate: true })).join('') : '<p class="card-sub" style="padding:14px">Belum ada transaksi di akun ini sejak saldo awal.</p>'}</div>`;
  openForm(a.name, html, null, '', {
    replace: sheetStack.length > 0,
    extra: `<div class="sheet-actions"><button class="btn-soft" data-a="acc-adjust:${esc(name)}" type="button">${icon('refresh')}Sesuaikan saldo</button>
      <button class="btn-primary" data-a="acc-edit:${esc(name)}" type="button">${icon('edit')}Edit</button></div>`
  });
}

function openAdjust(name) {
  const a = balances().map[name];
  if (!a) return;
  const html = `<p class="card-sub" style="margin:0 0 14px">Saldo menurut aplikasi: <b>${rpNet(a.bal)}</b>. Masukkan saldo sebenarnya (cek m-banking atau isi dompet). Selisihnya disesuaikan ke saldo awal, tanpa membuat transaksi baru.</p>` +
    fMoney('fAdjust', 'Saldo sebenarnya sekarang', Math.max(0, Math.round(a.bal)));
  openForm('Sesuaikan saldo ' + a.name, html, async () => {
    const diff = moneyVal('fAdjust') - a.bal;
    if (Math.abs(diff) < 0.5) { closeSheet(); toast('Saldo sudah sesuai', 'success'); return; }
    const acc = { origName: a.name, name: a.name, type: a.type, opening: a.opening + diff, openingDate: a.openingDate, note: a.note, archived: a.status === 'Arsip' };
    await assetCall('accountSave', { acc }, `Saldo ${a.name} disesuaikan (${diff > 0 ? '+' : '−'}${rp(diff)})`);
  }, 'Sesuaikan', { replace: true });
}

async function deleteAccount(name, btn) {
  const ok = await confirmDlg({ title: 'Hapus akun?', msg: `Akun "${name}" akan dihapus dari sheet Akun. Akun yang sudah dipakai di transaksi tidak bisa dihapus, hanya bisa diarsipkan.`, ok: 'Hapus' });
  if (ok) assetCall('accountDelete', { name }, 'Akun dihapus', btn);
}

/* ---------- Emas ---------- */
function openGoldForm(id) {
  const x = id ? S.assets.gold.find((g) => g.id === id) : null;
  const accNames = activeAccounts().map((a) => a.name);
  const hasLink = x ? allTx().some((t) => t.goldId === x.id && t.type === 'out') : true;
  const places = uniq(S.assets.gold.map((g) => g.place));
  let html = fDate('gDate', 'Tanggal beli', x ? x.date : today()) +
    fPick('gType', 'Jenis', GOLD_TYPES.concat(uniq(S.assets.gold.map((g) => g.type))), x ? x.type : 'Antam', { custom: true }) +
    fPick('gPurity', 'Kadar', GOLD_PURITY, x ? x.purity : '24K (999,9)', { custom: true, optional: true }) +
    `<div class="grid2">${fGram('gGrams', 'Berat total', x ? x.grams : '')}${fNum('gPieces', 'Jumlah keping', x ? x.pieces : 1)}</div>` +
    fMoney('gPpg', 'Harga per gram', x ? x.pricePerGram : '') +
    fMoney('gTotal', 'Total dibayar', x ? x.total : '', 'Otomatis = berat × harga per gram. Ubah bila ada biaya lain (ongkos cetak, pajak).') +
    fText('gPlace', 'Tempat beli', x ? x.place : '', 'mis. Butik Antam, Pegadaian, toko emas', 'list="dlPlace"') +
    `<datalist id="dlPlace">${places.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>` +
    (accNames.length || (x && x.account) ? fPick('gAcc', 'Dibayar dari akun', accNames, x ? x.account : goldAccount('gold_buy'), { optional: true, icon: accTypeOf }) : '') +
    fText('gCert', 'No. sertifikat / seri (opsional)', x ? x.cert : '', 'mis. kode di kemasan Antam') +
    fText('gStore', 'Lokasi simpan (opsional)', x ? x.storage : '', 'mis. Brankas rumah', 'list="dlStore"') +
    `<datalist id="dlStore">${GOLD_STORAGE.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>` +
    fText('gNote', 'Catatan (opsional)', x ? x.note : '') +
    fCheck('gLink', `Catat juga di sheet Pengeluaran sebagai “${CAT_GOLD_BUY}”`, hasLink);
  if (x && x.status === 'Dijual') {
    html += '<p class="mini-label" style="margin:18px 2px 8px">Penjualan</p>' + fDate('gSoldDate', 'Tanggal jual', x.soldDate) +
      fMoney('gSoldTotal', 'Total diterima', x.soldTotal) +
      (accNames.length || x.soldAccount ? fPick('gSoldAcc', 'Uang masuk ke akun', accNames, x.soldAccount, { optional: true, icon: accTypeOf }) : '');
  }
  openForm(x ? 'Edit Emas' : 'Beli Emas', html, () => saveGold(x), x ? 'Simpan perubahan' : 'Simpan pembelian', { replace: sheetStack.length > 0 });
}

function recalcGold(changed) {
  const grams = gramVal('gGrams');
  if (changed === 'total') {
    const total = moneyVal('gTotal');
    if (grams > 0 && total > 0) setMoney('gPpg', total / grams);
  } else {
    const ppg = moneyVal('gPpg');
    if (grams > 0 && ppg > 0) setMoney('gTotal', grams * ppg);
  }
}

async function saveGold(x) {
  const grams = gramVal('gGrams');
  if (!(grams > 0)) return formErr('Isi berat emas (gram).');
  const total = moneyVal('gTotal'); const ppg = moneyVal('gPpg');
  if (!(total > 0) && !(ppg > 0)) return formErr('Isi harga per gram atau total dibayar.');
  const type = pickVal('gType');
  if (!type) return formErr('Pilih jenis emas.');
  const date = $('#gDate').value;
  if (!date) return formErr('Isi tanggal beli.');
  const gold = {
    id: x ? x.id : '', date, type, purity: pickVal('gPurity'), pieces: Math.max(1, parseInt($('#gPieces').value, 10) || 1),
    grams, pricePerGram: ppg, total: total || Math.round(ppg * grams), place: $('#gPlace').value.trim(),
    account: FS.gAcc || '', cert: $('#gCert').value.trim(), storage: $('#gStore').value.trim(), note: $('#gNote').value.trim(),
    linkExpense: $('#gLink').checked
  };
  if (x && x.status === 'Dijual') gold.sale = { date: $('#gSoldDate').value, total: moneyVal('gSoldTotal'), account: FS.gSoldAcc || '' };
  if (!x) rememberAccount('gold_buy', gold.account);
  await assetCall('goldSave', { gold }, x ? 'Catatan emas diperbarui' : `Emas ${fmtGram(grams)} g tersimpan${gold.linkExpense ? ' + tercatat di Pengeluaran' : ''}`);
}

function openGoldDetail(id) {
  const x = S.assets.gold.find((g) => g.id === id);
  if (!x) { toast('Catatan emas tidak ditemukan. Coba sinkronkan ulang.', 'warn'); return; }
  const p = latestPrice(x.type);
  const sold = x.status === 'Dijual';
  const value = sold ? x.soldTotal : p ? x.grams * p.price : null;
  const row = (k, v) => (v ? `<li><span>${k}</span><b>${v}</b></li>` : '');
  const html = `<div class="detail-hero"><div class="tx-ico gold">${icon('gold')}</div>
      <div class="detail-amt">${fmtGram(x.grams)} g</div>
      <div class="detail-type">${esc(x.type)}${x.purity ? ' · ' + esc(x.purity) : ''}${sold ? ' · terjual' : ''}</div>
      ${value !== null ? `<div class="detail-sub">${sold ? 'Dijual' : 'Nilai buyback'} ${rp(value)} ${plText(value - x.total, ((value - x.total) / x.total) * 100)}</div>` : ''}</div>
    <ul class="kv">
      ${row('Tanggal beli', esc(fmtLong(x.date)))}
      ${row('Harga per gram', rp(x.pricePerGram))}
      ${row('Total dibayar (modal)', rp(x.total))}
      ${row('Jumlah keping', x.pieces > 1 ? String(x.pieces) : '')}
      ${row('Tempat beli', esc(x.place))}
      ${row('Dibayar dari', esc(x.account))}
      ${row('No. sertifikat', esc(x.cert))}
      ${row('Lokasi simpan', esc(x.storage))}
      ${row('Catatan', esc(x.note))}
      ${!sold && p ? row('Harga buyback', `${rp(p.price)}/g <small>· ${esc(fmtDM(p.date))}</small>`) : ''}
      ${sold ? row('Tanggal jual', esc(fmtLong(x.soldDate))) + row('Diterima di', esc(x.soldAccount)) : ''}
      ${row('ID', `${esc(x.id)} <small>· sheet Emas</small>`)}
    </ul>
    ${!sold && !p ? `<button class="note-warn as-btn" data-a="price" type="button">${icon('info')}<span>Isi harga buyback ${esc(x.type)} untuk melihat nilai dan untung/ruginya sekarang.</span></button>` : ''}`;
  const actions = sold
    ? `<div class="sheet-actions"><button class="btn-outline-danger" data-a="gold-del:${esc(x.id)}" type="button">${icon('trash')}Hapus</button>
       <button class="btn-primary" data-a="gold-edit:${esc(x.id)}" type="button">${icon('edit')}Edit</button></div>`
    : `<div class="sheet-actions three"><button class="btn-outline-danger" data-a="gold-del:${esc(x.id)}" type="button" aria-label="Hapus">${icon('trash')}</button>
       <button class="btn-soft" data-a="gold-edit:${esc(x.id)}" type="button">${icon('edit')}Edit</button>
       <button class="btn-primary" data-a="gold-sell:${esc(x.id)}" type="button">${icon('in')}Jual</button></div>`;
  openForm('Detail Emas', html, null, '', { extra: actions, replace: sheetStack.length > 0 });
}

async function deleteGold(id, btn) {
  const x = S.assets.gold.find((g) => g.id === id);
  if (!x) return;
  const ok = await confirmDlg({
    title: 'Hapus catatan emas?',
    msg: `${x.type} · ${fmtGram(x.grams)} g (${x.id})\n\nBaris di sheet Emas akan dihapus, termasuk baris “${CAT_GOLD_BUY}” / “${CAT_GOLD_SELL}” yang tertaut di Pengeluaran/Pemasukan.`,
    ok: 'Hapus'
  });
  if (ok) assetCall('goldDelete', { id }, 'Catatan emas dihapus', btn);
}

function openSellForm(id) {
  const x = S.assets.gold.find((g) => g.id === id);
  if (!x) return;
  sellTarget = x;
  const p = latestPrice(x.type);
  const accNames = activeAccounts().map((a) => a.name);
  const html = `<p class="card-sub" style="margin:0 0 14px">${esc(x.type)} · ${fmtGram(x.grams)} g · modal ${rp(x.total)}. Bisa dijual sebagian; sisanya tetap tercatat dimiliki.</p>` +
    fDate('sDate', 'Tanggal jual', today()) + fGram('sGrams', 'Berat dijual', x.grams) +
    fMoney('sPpg', 'Harga jual per gram', p ? p.price : '') +
    fMoney('sTotal', 'Total diterima', p ? p.price * x.grams : '') +
    (accNames.length ? fPick('sAcc', 'Uang masuk ke akun', accNames, goldAccount('gold_sell'), { optional: true, icon: accTypeOf }) : '') +
    fCheck('sLink', `Catat di sheet Pemasukan sebagai “${CAT_GOLD_SELL}”`, true) +
    '<div class="sell-preview" id="sellPreview"></div>';
  openForm('Jual Emas', html, () => saveSell(x), 'Simpan penjualan', { replace: true });
  sellPreview(x);
}

function recalcSell(changed, x) {
  const grams = gramVal('sGrams');
  if (changed === 'total') { const t = moneyVal('sTotal'); if (grams > 0 && t > 0) setMoney('sPpg', t / grams); }
  else { const ppg = moneyVal('sPpg'); if (grams > 0 && ppg > 0) setMoney('sTotal', grams * ppg); }
  sellPreview(x);
}

function sellPreview(x) {
  const el = $('#sellPreview'); if (!el || !x) return;
  const grams = Math.min(gramVal('sGrams'), x.grams); const total = moneyVal('sTotal');
  if (!(grams > 0) || !(total > 0)) { el.innerHTML = ''; return; }
  const cost = x.total * (grams / x.grams);
  el.innerHTML = `<span>Modal bagian ini <b>${rp(cost)}</b></span>${plText(total - cost, ((total - cost) / cost) * 100)}`;
}

async function saveSell(x) {
  const grams = gramVal('sGrams'); const total = moneyVal('sTotal');
  if (!(grams > 0) || grams > x.grams + 1e-9) return formErr(`Berat dijual harus antara 0 dan ${fmtGram(x.grams)} gram.`);
  if (!(total > 0)) return formErr('Isi total uang yang diterima.');
  const sale = { id: x.id, date: $('#sDate').value || today(), grams, total, account: FS.sAcc || '', linkIncome: $('#sLink').checked };
  rememberAccount('gold_sell', sale.account);
  await assetCall('goldSell', { sale }, `Penjualan ${fmtGram(grams)} g tercatat`);
}

function openPriceForm() {
  const g = goldCalc();
  const types = uniq(g.held.map((x) => x.type).concat(S.assets.prices.map((p) => p.type)));
  if (!types.length) types.push('Antam');
  const html = '<p class="card-sub" style="margin:0 0 14px">Isi harga <b>buyback</b> (harga jual kembali) per gram hari ini, supaya nilai emasmu realistis. Untuk Antam bisa dicek di situs logammulia.com.</p>' +
    fDate('pDate', 'Tanggal harga', today()) +
    types.map((t, i) => { const p = latestPrice(t); return fMoney('pr' + i, esc(t) + ' · per gram', p ? p.price : '', p ? `Terakhir ${rp(p.price)} · ${fmtShort(p.date)}` : ''); }).join('');
  openForm('Harga Buyback Emas', html, async () => {
    const date = $('#pDate').value || today();
    const prices = types.map((t, i) => ({ type: t, price: moneyVal('pr' + i), date })).filter((p) => p.price > 0);
    if (!prices.length) return formErr('Isi minimal satu harga.');
    await assetCall('priceSave', { prices }, 'Harga emas diperbarui');
  }, 'Simpan harga', { replace: sheetStack.length > 0 });
}

/* =====================================================================
   EVENT
   ===================================================================== */
document.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick],[data-pickcustom]');
  if (pick) {
    const name = pick.dataset.pick || pick.dataset.pickcustom;
    const group = pick.closest('[data-group]');
    const custom = $('#pc-' + name);
    if (pick.dataset.pickcustom) {
      FS[name] = '';
      $$('.chip', group).forEach((c) => c.classList.remove('on'));
      if (custom) { custom.hidden = false; custom.focus(); }
    } else {
      const v = pick.dataset.val;
      FS[name] = FS[name] === v && FS_OPT[name] ? '' : v;
      $$('.chip', group).forEach((c) => c.classList.toggle('on', c.dataset.val === FS[name]));
      if (custom) { custom.hidden = true; custom.value = ''; }
    }
    haptic(6);
    return;
  }
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const v = el.dataset.a;
  const i = v.indexOf(':');
  const act = i < 0 ? v : v.slice(0, i);
  const arg = i < 0 ? '' : v.slice(i + 1);
  switch (act) {
    case 'tab': S.ui.assetTab = arg; saveUi(); if (S.tab !== 'assets') switchTab('assets'); else renderAssets(); break;
    case 'acc-new': openAccountForm(); break;
    case 'acc': openAccountDetail(arg); break;
    case 'acc-edit': openAccountForm(arg); break;
    case 'acc-adjust': openAdjust(arg); break;
    case 'acc-del': deleteAccount(arg, el); break;
    case 'tf-new': openAdd({ type: 'tf' }); break;
    case 'gold-new': openGoldForm(); break;
    case 'gold': openGoldDetail(arg); break;
    case 'gold-edit': openGoldForm(arg); break;
    case 'gold-sell': openSellForm(arg); break;
    case 'gold-del': deleteGold(arg, el); break;
    case 'price': openPriceForm(); break;
    case 'toggle-sold': S.ui.showSold = !S.ui.showSold; saveUi(); renderAssets(); break;
    case 'promo-dismiss': S.ui.assetPromoDismissed = true; saveUi(); renderCurrent(); break;
    case 'submit': if (formSubmit) formSubmit(); break;
    default: break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches && t.matches('[data-money]')) {
    const d = t.value.replace(/[^\d]/g, '').slice(0, 13);
    t.value = d ? NF.format(Number(d)) : '';
  }
  if (t.id === 'gGrams' || t.id === 'gPpg') recalcGold('ppg');
  else if (t.id === 'gTotal') recalcGold('total');
  else if (t.id === 'sGrams' || t.id === 'sPpg' || t.id === 'sTotal') recalcSell(t.id === 'sTotal' ? 'total' : 'ppg', sellTarget);
});
