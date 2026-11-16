/* =====================================================================
   DOMPET · charts.js
   Grafik SVG/HTML ringan tanpa library (bisa jalan offline).
   ===================================================================== */
'use strict';

const Charts = {
  // Urutan warna kategori tetap (lolos uji buta warna). Warna mengikuti kategori, bukan peringkat.
  palette: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'],
  other: '#b9bdc9',
  darkText: ['#eda100'],

  el(tag, attrs, text) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  },

  svg(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    return e;
  },

  /** Satu batang tersegmen (porsi tiap kategori) + legenda berisi nilai. */
  segBar(container, items, fmt) {
    container.textContent = '';
    const total = items.reduce((s, x) => s + x.value, 0);
    if (!total) return;
    const bar = this.el('div', { class: 'segbar', role: 'img',
      'aria-label': items.map((x) => `${x.label} ${Math.round((x.value / total) * 100)}%`).join(', ') });
    items.forEach((x) => {
      const share = x.value / total;
      if (share <= 0) return;
      const seg = this.el('div', { class: 'segbar-part', title: `${x.label}: ${fmt(x.value)} (${(share * 100).toFixed(1)}%)`,
        style: `flex:${share} 1 0;background:${x.color};color:${this.darkText.includes(x.color) ? '#0b0b0b' : '#fff'}` });
      if (share >= 0.12) seg.textContent = Math.round(share * 100) + '%';
      bar.appendChild(seg);
    });
    container.appendChild(bar);

    const legend = this.el('ul', { class: 'legend-list' });
    items.forEach((x) => {
      const li = this.el('li');
      li.appendChild(this.el('span', { class: 'sw', style: `background:${x.color}` }));
      li.appendChild(this.el('span', { class: 'lg-name' }, x.label));
      li.appendChild(this.el('span', { class: 'lg-val' }, fmt(x.value)));
      li.appendChild(this.el('span', { class: 'lg-pct' }, Math.round((x.value / total) * 100) + '%'));
      legend.appendChild(li);
    });
    container.appendChild(legend);
  },

  /** Daftar batang berperingkat: nama, nominal, persentase. */
  rankBars(container, items, fmt, onTap) {
    container.textContent = '';
    const total = items.reduce((s, x) => s + x.value, 0);
    const max = Math.max(...items.map((x) => x.value), 1);
    const list = this.el('ul', { class: 'rank-list' });
    items.forEach((x) => {
      const li = this.el('li', { class: 'rank-row', tabindex: onTap ? '0' : '-1' });
      const top = this.el('div', { class: 'rank-top' });
      const name = this.el('span', { class: 'rank-name' });
      name.appendChild(this.el('span', { class: 'sw', style: `background:${x.color}` }));
      name.appendChild(document.createTextNode(x.label));
      top.appendChild(name);
      const val = this.el('span', { class: 'rank-val' }, fmt(x.value));
      val.appendChild(this.el('small', null, ' · ' + (total ? Math.round((x.value / total) * 100) : 0) + '%'));
      top.appendChild(val);
      li.appendChild(top);
      const track = this.el('div', { class: 'rank-track' });
      track.appendChild(this.el('div', { class: 'rank-fill', style: `width:${Math.max(2, (x.value / max) * 100)}%;background:${x.color}` }));
      li.appendChild(track);
      if (x.sub) li.appendChild(this.el('div', { class: 'rank-sub' }, x.sub));
      if (onTap) li.addEventListener('click', () => onTap(x));
      list.appendChild(li);
    });
    container.appendChild(list);
  },

  niceMax(v) {
    if (!(v > 0)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * exp;
  },

  /**
   * Grafik kolom (1 atau 2 seri, berdampingan).
   * cfg: { labels, series:[{name,color,values}], fmtTick, fmtVal, tipTitle(i), height, ariaLabel }
   */
  columns(container, cfg) {
    container.textContent = '';
    container.classList.add('colchart');
    const W = Math.max(260, container.clientWidth || 320);
    const H = cfg.height || 190;
    const pad = { l: 46, r: 6, t: 10, b: 24 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const n = cfg.labels.length;
    const k = cfg.series.length;
    const all = cfg.series.flatMap((s) => s.values);
    const yMax = this.niceMax(Math.max(...all, 0));
    const y = (v) => pad.t + ph - (v / yMax) * ph;

    const svg = this.svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': cfg.ariaLabel || 'Grafik' });

    // garis bantu horizontal (hairline) + label sumbu Y
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      const yy = Math.round(y(v)) + 0.5;
      svg.appendChild(this.svg('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: i === 0 ? 'ax-base' : 'ax-grid' }));
      const t = this.svg('text', { x: pad.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'ax-label' });
      t.textContent = cfg.fmtTick(v);
      svg.appendChild(t);
    }

    const band = pw / n;
    const gap = 2;
    const barW = Math.max(3, Math.min(24, (band * 0.72 - gap * (k - 1)) / k));
    const groupW = barW * k + gap * (k - 1);
    const groups = [];

    for (let i = 0; i < n; i++) {
      const g = this.svg('g', { class: 'col-group' });
      const x0 = pad.l + band * i + (band - groupW) / 2;
      cfg.series.forEach((s, j) => {
        const v = s.values[i] || 0;
        if (v <= 0) return;
        const x = x0 + j * (barW + gap);
        const top = y(v);
        const h = pad.t + ph - top;
        const r = Math.min(4, h, barW / 2);
        const d = `M${x},${pad.t + ph} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${pad.t + ph} Z`;
        g.appendChild(this.svg('path', { d, fill: s.color }));
      });
      // area sentuh lebih besar dari batangnya
      const hit = this.svg('rect', { x: pad.l + band * i, y: pad.t, width: band, height: ph, fill: 'transparent', class: 'col-hit', tabindex: '0',
        'aria-label': cfg.tipTitle(i) + ': ' + cfg.series.map((s) => `${s.name} ${cfg.fmtVal(s.values[i] || 0)}`).join(', ') });
      g.appendChild(hit);
      svg.appendChild(g);
      groups.push(g);
    }

    // label sumbu X (dijarangkan agar tidak bertumpuk)
    const maxLabels = Math.max(2, Math.floor(pw / 38));
    const step = Math.ceil(n / maxLabels);
    const shown = [];
    for (let i = 0; i < n; i += step) shown.push(i);
    if (shown[shown.length - 1] !== n - 1) {
      if (shown.length > 1 && n - 1 - shown[shown.length - 1] < step * 0.6) shown.pop();
      shown.push(n - 1);
    }
    for (const i of shown) {
      const t = this.svg('text', { x: pad.l + band * i + band / 2, y: H - 6, 'text-anchor': 'middle', class: 'ax-label' });
      t.textContent = cfg.labels[i];
      svg.appendChild(t);
    }

    container.appendChild(svg);

    // tooltip (ketuk batang)
    const tip = this.el('div', { class: 'chart-tip', role: 'status' });
    tip.hidden = true;
    container.appendChild(tip);
    let active = -1;
    const show = (i) => {
      if (active === i) { hide(); return; }
      active = i;
      groups.forEach((g, gi) => g.classList.toggle('dim', gi !== i));
      tip.textContent = '';
      tip.appendChild(this.el('div', { class: 'tip-title' }, cfg.tipTitle(i)));
      cfg.series.forEach((s) => {
        const row = this.el('div', { class: 'tip-row' });
        row.appendChild(this.el('span', { class: 'tip-key', style: `background:${s.color}` }));
        row.appendChild(this.el('strong', null, cfg.fmtVal(s.values[i] || 0)));
        if (k > 1) row.appendChild(this.el('span', { class: 'tip-name' }, s.name));
        tip.appendChild(row);
      });
      if (cfg.tipExtra) { const ex = cfg.tipExtra(i); if (ex) tip.appendChild(this.el('div', { class: 'tip-extra' }, ex)); }
      tip.hidden = false;
      const cx = pad.l + band * i + band / 2;
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(4, cx - tw / 2), W - tw - 4) + 'px';
    };
    const hide = () => { active = -1; tip.hidden = true; groups.forEach((g) => g.classList.remove('dim')); };
    groups.forEach((g, i) => {
      const hit = g.querySelector('.col-hit');
      hit.addEventListener('click', (e) => { e.stopPropagation(); show(i); });
      hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(i); } });
    });
    container.addEventListener('click', (e) => { if (!e.target.closest('.col-hit')) hide(); });

    // tampilan tabel (aksesibilitas & angka persis)
    if (cfg.table !== false) {
      const det = this.el('details', { class: 'chart-table' });
      det.appendChild(this.el('summary', null, 'Lihat sebagai tabel'));
      const tbl = this.el('table');
      const thead = this.el('tr');
      thead.appendChild(this.el('th', null, cfg.tableHead || 'Periode'));
      cfg.series.forEach((s) => thead.appendChild(this.el('th', null, s.name)));
      tbl.appendChild(thead);
      for (let i = n - 1; i >= 0; i--) {
        if (cfg.series.every((s) => !(s.values[i] > 0))) continue;
        const tr = this.el('tr');
        tr.appendChild(this.el('td', null, cfg.tipTitle(i)));
        cfg.series.forEach((s) => tr.appendChild(this.el('td', null, cfg.fmtVal(s.values[i] || 0))));
        tbl.appendChild(tr);
      }
      det.appendChild(tbl);
      container.appendChild(det);
    }
  }
};
