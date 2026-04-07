/**
 * SPC — Statistical Process Control
 * script.js — Single-page layout
 * กราฟวาดด้วย Canvas 2D API ไม่พึ่ง library ใดๆ
 */
'use strict';

/* ============================================================
   §1  STATE
   ============================================================ */
const State = (() => {
  let d = {
    k: 10, n: 5,
    standard: null, usl: null, lsl: null,
    meas: [],       // [sg][row] = number|null
    ready: false,
  };
  return {
    get: () => d,
    set: (p) => { d = { ...d, ...p }; },
    resetMeas() {
      d.meas = Array.from({ length: d.k }, () => Array(d.n).fill(null));
    },
  };
})();

/* ============================================================
   §2  SPC CONSTANTS  (AIAG)
   ============================================================ */
const CONSTS = {
  2:  [1.880, 0,     3.267, 1.128],
  3:  [1.023, 0,     2.574, 1.693],
  4:  [0.729, 0,     2.282, 2.059],
  5:  [0.577, 0,     2.114, 2.326],
  6:  [0.483, 0,     2.004, 2.534],
  7:  [0.419, 0.076, 1.924, 2.704],
  8:  [0.373, 0.136, 1.864, 2.847],
  9:  [0.337, 0.184, 1.816, 2.970],
  10: [0.308, 0.223, 1.777, 3.078],
};
const getC = (n) => {
  const c = CONSTS[n]; if (!c) return null;
  return { A2: c[0], D3: c[1], D4: c[2], d2: c[3] };
};

/* ============================================================
   §3  CALCULATIONS
   ============================================================ */
const mean  = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const range = (a) => Math.max(...a) - Math.min(...a);

function compute() {
  const { meas, n, usl, lsl } = State.get();
  const complete = meas
    .map(col => { const v = col.filter(x => x !== null && !isNaN(x)); return v.length >= n ? v.slice(0, n) : null; })
    .filter(Boolean);
  if (!complete.length) return null;

  const c = getC(n); if (!c) return null;
  const { A2, D3, D4, d2 } = c;

  const xbars  = complete.map(mean);
  const ranges = complete.map(range);
  const Xbb    = mean(xbars);
  const Rb     = mean(ranges);
  const uclX   = Xbb + A2 * Rb;
  const lclX   = Xbb - A2 * Rb;
  const uclR   = D4 * Rb;
  const lclR   = D3 * Rb;
  const sigma  = Rb / d2;

  let Cp = null, Cpk = null;
  if (usl !== null && lsl !== null && sigma > 0) {
    Cp  = (usl - lsl) / (6 * sigma);
    Cpk = Math.min((usl - Xbb) / (3 * sigma), (Xbb - lsl) / (3 * sigma));
  }

  const details = complete.map((vals, i) => {
    const xb = mean(vals), r = range(vals);
    return { i: i + 1, xb, r, min: Math.min(...vals), max: Math.max(...vals),
             oocX: xb > uclX || xb < lclX, oocR: r > uclR };
  });

  return { Xbb, Rb, uclX, lclX, uclR, lclR, A2, D3, D4, d2, Cp, Cpk, sigma, details };
}

/* ============================================================
   §4  DOM HELPERS
   ============================================================ */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fmt = (v, dp = 4) => (v !== null && v !== undefined && !isNaN(v)) ? (+v).toFixed(dp) : '—';
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ============================================================
   §5  TOAST
   ============================================================ */
function toast(msg, type = 'info', ms = 3000) {
  const el = Object.assign(document.createElement('div'), {
    className: `toast toast-${type}`,
    innerHTML: `<span class="tdot"></span><span>${msg}</span>`,
  });
  $('#toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, ms);
}

/* ============================================================
   §6  TABLE BUILDER
   ============================================================ */
function buildTable() {
  const s   = State.get();
  const con = $('#table-scroll');
  con.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'data-table';

  /* ─── thead ─── */
  const thead = table.createTHead();
  const trh   = thead.insertRow();

  // sticky corner
  const thc = document.createElement('th');
  thc.className = 'sticky-head'; thc.textContent = 'Sample';
  trh.appendChild(thc);

  for (let sg = 0; sg < s.k; sg++) {
    const th = document.createElement('th');
    th.id = `ch-${sg}`;
    th.innerHTML = `<span class="col-label">x<sub>${sg+1}</sub></span>`;
    trh.appendChild(th);
  }
  // Avg header
  const thAvg = document.createElement('th');
  thAvg.textContent = 'Avg'; trh.appendChild(thAvg);

  /* ─── tbody: data rows ─── */
  const tbody = document.createElement('tbody');
  for (let row = 0; row < s.n; row++) {
    const tr = tbody.insertRow();
    const tdl = tr.insertCell();
    tdl.className = 'row-lbl';
    tdl.innerHTML = `n<sub>${row+1}</sub>`;

    for (let sg = 0; sg < s.k; sg++) {
      const td = tr.insertCell();
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.01'; inp.className = 'cell-input';
      inp.dataset.sg = sg; inp.dataset.row = row;
      inp.setAttribute('aria-label', `SG${sg+1} sample ${row+1}`);
      inp.setAttribute('inputmode', 'decimal');

      const existing = s.meas[sg]?.[row];
      if (existing !== null && existing !== undefined) {
        inp.value = existing; inp.classList.add('filled');
      }
      inp.addEventListener('input', onCellInput);
      inp.addEventListener('keydown', onCellKey);
      td.appendChild(inp);
    }
    // row avg placeholder
    const tdA = tr.insertCell();
    tdA.id = `avg-r${row}`;
    tdA.className = 'sum-row'; // reuse style
    tdA.style.fontFamily = 'var(--mono)';
    tdA.style.fontSize = '.72rem';
    tdA.textContent = '—';
    trh.appendChild(thAvg); // ignored duplicate; added once already
  }

  /* ─── summary rows: X̄ and R ─── */
  const trXbar = tbody.insertRow();
  trXbar.className = 'sum-row';
  const tdXl = trXbar.insertCell(); tdXl.className = 'row-lbl'; tdXl.textContent = 'X̄';
  for (let sg = 0; sg < s.k; sg++) {
    const td = trXbar.insertCell(); td.id = `sr-x-${sg}`; td.textContent = '—';
  }
  const tdXavg = trXbar.insertCell(); tdXavg.id = 'sr-xavg'; tdXavg.textContent = '—';

  const trR = tbody.insertRow();
  trR.className = 'sum-row';
  const tdRl = trR.insertCell(); tdRl.className = 'row-lbl'; tdRl.textContent = 'R';
  for (let sg = 0; sg < s.k; sg++) {
    const td = trR.insertCell(); td.id = `sr-r-${sg}`; td.textContent = '—';
  }
  const tdRavg = trR.insertCell(); tdRavg.id = 'sr-ravg'; tdRavg.textContent = '—';

  table.appendChild(tbody);
  con.appendChild(table);

  $('#empty-state') && $('#empty-state').remove();
  $('#table-meta').textContent = `${s.k} Subgroups × ${s.n} Samples`;
  updateColHeaders();
}

function updateColHeaders() {
  const s = State.get();
  for (let sg = 0; sg < s.k; sg++) {
    const th  = $(`#ch-${sg}`); if (!th) continue;
    const col = s.meas[sg] || [];
    const done = col.filter(v => v !== null && !isNaN(v)).length >= s.n;
    th.classList.toggle('col-done', done);
    const existing = th.querySelector('.col-dot');
    if (done && !existing) {
      const dot = document.createElement('span');
      dot.className = 'col-dot'; th.appendChild(dot);
    } else if (!done && existing) { existing.remove(); }
  }
}

/* ============================================================
   §7  CELL EVENTS
   ============================================================ */
function onCellInput(e) {
  const inp = e.target;
  const sg  = +inp.dataset.sg;
  const row = +inp.dataset.row;
  const val = inp.value.trim();
  const s   = State.get();

  if (!s.meas[sg]) s.meas[sg] = Array(s.n).fill(null);

  if (val === '' || isNaN(+val)) {
    s.meas[sg][row] = null;
    inp.classList.remove('filled');
  } else {
    s.meas[sg][row] = parseFloat((+val).toFixed(6));
    inp.classList.add('filled');
  }

  updateTableSummary(sg);
  updateColHeaders();

  // ตรวจว่าคอลัมน์ครบ
  const colFilled = s.meas[sg].filter(v => v !== null && !isNaN(v)).length;
  if (colFilled >= s.n) {
    refreshAll();
    toast(`Subgroup ${sg + 1} complete — อัปเดตผลลัพธ์แล้ว`, 'success', 2200);
  }
}

function onCellKey(e) {
  const s   = State.get();
  const sg  = +e.target.dataset.sg;
  const row = +e.target.dataset.row;
  let nsg = sg, nrow = row;

  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    nrow = row + 1 < s.n ? row + 1 : 0;
    if (nrow === 0) nsg = sg + 1 < s.k ? sg + 1 : sg;
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    nrow = row - 1 >= 0 ? row - 1 : s.n - 1;
    if (nrow === s.n - 1) nsg = sg - 1 >= 0 ? sg - 1 : sg;
    e.preventDefault();
  } else if (e.key === 'ArrowRight') { nsg = Math.min(sg + 1, s.k - 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft')  { nsg = Math.max(sg - 1, 0);       e.preventDefault(); }
  else return;

  const next = document.querySelector(`.cell-input[data-sg="${nsg}"][data-row="${nrow}"]`);
  if (next) next.focus();
}

/* อัปเดต summary row X̄ และ R ของแต่ละคอลัมน์ */
function updateTableSummary(sg) {
  const s   = State.get();
  const col = (s.meas[sg] || []).filter(v => v !== null && !isNaN(v));
  const xEl = $(`#sr-x-${sg}`);
  const rEl = $(`#sr-r-${sg}`);
  if (!xEl || !rEl) return;

  if (col.length >= s.n) {
    xEl.textContent = mean(col).toFixed(4);
    rEl.textContent = range(col).toFixed(4);
  } else {
    xEl.textContent = '—';
    rEl.textContent = '—';
  }

  // Avg column (grand mean across all complete)
  const res = compute();
  if (res) {
    const xavg = $(`#sr-xavg`); if (xavg) xavg.textContent = res.Xbb.toFixed(4);
    const ravg = $(`#sr-ravg`); if (ravg) ravg.textContent = res.Rb.toFixed(4);
  }
}

/* ============================================================
   §8  REFRESH ALL — คำนวณและอัปเดตทุกส่วน
   ============================================================ */
function refreshAll() {
  const res = compute();
  updateSidePanel(res);
  drawXbarChart(res);
  drawRChart(res);
}

/* ============================================================
   §9  SIDE PANEL
   ============================================================ */
function updateSidePanel(res) {
  const s = State.get();

  // Spec display
  setText('d-std', s.standard !== null ? s.standard.toFixed(4) : '—');
  setText('d-usl', s.usl !== null ? s.usl.toFixed(4) : '—');
  setText('d-lsl', s.lsl !== null ? s.lsl.toFixed(4) : '—');
  setText('d-n', s.n);

  if (!res) {
    ['d-xbarbar','d-uclx','d-lclx','d-rbar','d-uclr','d-lclr',
     'd-a2','d-d3','d-d4','d-d2','d-cp','d-cpk'].forEach(id => setText(id, '—'));
    setText('d-cap-status', '');
    return;
  }
  const { Xbb, Rb, uclX, lclX, uclR, lclR, A2, D3, D4, d2, Cp, Cpk } = res;

  setText('d-xbarbar', fmt(Xbb));
  setText('d-uclx',    fmt(uclX));
  setText('d-lclx',    fmt(lclX));
  setText('d-rbar',    fmt(Rb));
  setText('d-uclr',    fmt(uclR));
  setText('d-lclr',    fmt(lclR));
  setText('d-a2',      fmt(A2, 3));
  setText('d-d3',      fmt(D3, 3));
  setText('d-d4',      fmt(D4, 3));
  setText('d-d2',      fmt(d2, 3));
  setText('d-cp',      Cp  !== null ? fmt(Cp, 3)  : '—');
  setText('d-cpk',     Cpk !== null ? fmt(Cpk, 3) : '—');

  const badge = $('#d-cap-status');
  if (badge && Cpk !== null) {
    const v = Math.min(Cp, Cpk);
    if (v >= 1.33)     { badge.textContent = '✓ Capable (≥ 1.33)'; badge.className = 'cap-badge good'; }
    else if (v >= 1.0) { badge.textContent = '⚠ Marginal';          badge.className = 'cap-badge marginal'; }
    else               { badge.textContent = '✕ Not Capable';       badge.className = 'cap-badge poor'; }
  } else if (badge) { badge.textContent = ''; badge.className = 'cap-badge'; }
}

function setText(id, val) {
  const el = $(`#${id}`); if (el) el.textContent = val;
}

/* ============================================================
   §10  CANVAS CHART ENGINE  (Pure Canvas 2D)
   ============================================================ */

/**
 * drawSPCChart
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} dataArr     — Y values per subgroup
 * @param {boolean[]} oocArr     — true = out-of-control
 * @param {object[]} hLines      — [{value, color, dash, label, width}]
 * @param {string[]} labels      — X axis labels
 * @param {string} lineColor     — main line color
 * @param {string} yLabel
 * @param {object} specLines     — {usl, lsl} optional
 */
function drawSPCChart(canvas, dataArr, oocArr, hLines, labels, lineColor, yLabel, specLines = {}) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width, H = rect.height;
  const pad = { top: 20, right: 16, bottom: 40, left: 62 };
  const pw  = W - pad.left - pad.right;
  const ph  = H - pad.top  - pad.bottom;

  // Y range
  const specVals = [specLines.usl, specLines.lsl].filter(v => v !== null && v !== undefined);
  const allVals  = [...dataArr, ...hLines.map(l => l.value), ...specVals].filter(v => !isNaN(v));
  if (!allVals.length) return;

  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  const ySpan = yMax - yMin || 1;
  yMin -= ySpan * 0.18;
  yMax += ySpan * 0.18;

  const xPos = (i) => pad.left + (labels.length > 1 ? (i / (labels.length - 1)) * pw : pw / 2);
  const yPos = (v) => pad.top  + (1 - (v - yMin) / (yMax - yMin)) * ph;

  // ── Grid & Y-ticks ──
  const TICKS = 5;
  ctx.save();
  for (let t = 0; t <= TICKS; t++) {
    const yv  = yMin + (t / TICKS) * (yMax - yMin);
    const yp  = yPos(yv);
    ctx.strokeStyle = cssv('--border');
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, yp); ctx.lineTo(pad.left + pw, yp); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle    = cssv('--txt2');
    ctx.font         = `11px ${cssv('--mono')}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(yv.toFixed(3), pad.left - 6, yp);
  }
  ctx.restore();

  // ── Axes ──
  ctx.save();
  ctx.strokeStyle = cssv('--border');
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + ph);
  ctx.lineTo(pad.left + pw, pad.top + ph);
  ctx.stroke();
  ctx.restore();

  // ── X labels ──
  const step = Math.max(1, Math.ceil(labels.length / 20));
  ctx.save();
  ctx.fillStyle    = cssv('--txt2');
  ctx.font         = `10px ${cssv('--mono')}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  labels.forEach((lbl, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    ctx.fillText(lbl, xPos(i), pad.top + ph + 6);
  });
  ctx.restore();

  // ── Y label ──
  ctx.save();
  ctx.translate(12, pad.top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle    = cssv('--txt3');
  ctx.font         = `11px var(--font, sans-serif)`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // ── Spec lines (behind control lines) ──
  const drawSpecLine = (val, color, lbl) => {
    if (val === null || val === undefined) return;
    const yp = yPos(val);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.moveTo(pad.left, yp); ctx.lineTo(pad.left + pw, yp); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle    = color;
    ctx.font         = `bold 9px ${cssv('--mono')}`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(lbl, pad.left + 2, yp - 2);
    ctx.restore();
  };
  drawSpecLine(specLines.usl, cssv('--orange'), `USL ${specLines.usl?.toFixed(3) ?? ''}`);
  drawSpecLine(specLines.lsl, cssv('--orange'), `LSL ${specLines.lsl?.toFixed(3) ?? ''}`);

  // ── Horizontal control lines ──
  hLines.forEach(line => {
    const yp = yPos(line.value);
    ctx.save();
    ctx.strokeStyle = line.color;
    ctx.lineWidth   = line.width ?? 1.8;
    ctx.setLineDash(line.dash ?? []);
    ctx.globalAlpha = line.alpha ?? 1;
    ctx.beginPath(); ctx.moveTo(pad.left, yp); ctx.lineTo(pad.left + pw, yp); ctx.stroke();
    ctx.setLineDash([]);
    // label right side
    ctx.fillStyle    = line.color;
    ctx.font         = `bold 9.5px ${cssv('--mono')}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.globalAlpha  = 0.9;
    ctx.fillText(`${line.label} ${line.value.toFixed(4)}`, pad.left + pw - 2, yp - 2);
    ctx.restore();
  });

  // ── Area fill under data line ──
  const pts = dataArr.map((v, i) => ({ x: xPos(i), y: yPos(v) }));
  if (pts.length > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, yPos(yMin));
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, yPos(yMin));
    ctx.closePath();
    // parse hex/rgb to rgba
    ctx.fillStyle = hexToRgba(lineColor, 0.10);
    ctx.fill();
    ctx.restore();
  }

  // ── Data line ──
  if (pts.length > 1) {
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1.8;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }

  // ── Data points ──
  pts.forEach((p, i) => {
    const ooc   = oocArr[i];
    const color = ooc ? cssv('--red') : lineColor;
    const r     = ooc ? 6 : 4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = cssv('--card');
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    if (ooc) {
      ctx.fillStyle    = cssv('--red');
      ctx.font         = `bold 9px ${cssv('--mono')}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(dataArr[i].toFixed(4), p.x, p.y - r - 2);
    }
    ctx.restore();
  });

  // Store metadata for tooltip
  canvas._meta = { pts, dataArr, yMin, yMax, pad, pw, ph, yPos, xPos, labels };
  setupTooltip(canvas, lineColor);
}

/* Tooltip on hover */
function setupTooltip(canvas, lineColor) {
  if (canvas._thBound) {
    canvas.removeEventListener('mousemove', canvas._thBound);
    canvas.removeEventListener('mouseleave', canvas._tlBound);
  }
  const redraw = () => {
    const m = canvas._meta; if (!m) return;
    // just re-trigger the full draw — stored via closure trick
    // Actually we need a full redraw fn; we'll skip and just clear overlay
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    // We draw tooltip as overlay without clearing (additive) — simpler approach
  };

  canvas._thBound = (e) => {
    const m = canvas._meta; if (!m) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    let closest = null, minD = Infinity;
    m.pts.forEach((p, i) => { const d = Math.abs(p.x - mx); if (d < minD) { minD = d; closest = i; } });
    if (closest === null || minD > 40) return;

    // We'll show a native title — simple & reliable
    canvas.title = `SG ${closest + 1}: ${m.dataArr[closest].toFixed(4)}`;
  };
  canvas._tlBound = () => { canvas.title = ''; };
  canvas.addEventListener('mousemove', canvas._thBound);
  canvas.addEventListener('mouseleave', canvas._tlBound);
}

/* hex/named color → rgba */
function hexToRgba(color, alpha) {
  // handle CSS var results that might be rgb()
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (color.startsWith('rgb')) {
    return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  }
  return color;
}

/* ── Legend builder ── */
function buildLegend(id, items) {
  const el = $(`#${id}`); if (!el) return;
  el.innerHTML = items.map(it =>
    `<span class="leg-item">
       <span class="leg-line" style="background:${
         it.dash
           ? `repeating-linear-gradient(90deg,${it.color} 0 5px,transparent 5px 9px)`
           : it.color};"></span>
       ${it.label}
     </span>`
  ).join('');
}

/* ── Draw X̄ chart ── */
function drawXbarChart(res) {
  const canvas = $('#xbar-canvas');
  const ph     = $('#xbar-ph');
  if (!res) { if (ph) ph.classList.remove('hidden'); return; }
  if (ph) ph.classList.add('hidden');

  const s = State.get();
  const hLines = [
    { label: 'UCL', value: res.uclX, color: cssv('--red'),   width: 2,   dash: [] },
    { label: 'CL',  value: res.Xbb,  color: cssv('--green'), width: 1.6, dash: [7, 4] },
    { label: 'LCL', value: res.lclX, color: cssv('--red'),   width: 2,   dash: [] },
  ];
  if (s.standard !== null)
    hLines.push({ label: 'STD', value: s.standard, color: cssv('--brand'), width: 1.2, dash: [3, 3], alpha: 0.7 });

  drawSPCChart(
    canvas,
    res.details.map(d => d.xb),
    res.details.map(d => d.oocX),
    hLines,
    res.details.map(d => `x${d.i}`),
    cssv('--brand'),
    'X̄',
    { usl: s.usl, lsl: s.lsl }
  );

  buildLegend('legend-xbar', [
    { label: 'X̄',         color: cssv('--brand') },
    { label: 'UCL/LCL',   color: cssv('--red') },
    { label: 'Center',    color: cssv('--green'), dash: true },
    ...(s.usl !== null || s.lsl !== null ? [{ label: 'Spec', color: cssv('--orange'), dash: true }] : []),
  ]);
}

/* ── Draw R chart ── */
function drawRChart(res) {
  const canvas = $('#r-canvas');
  const ph     = $('#r-ph');
  if (!res) { if (ph) ph.classList.remove('hidden'); return; }
  if (ph) ph.classList.add('hidden');

  const hLines = [
    { label: 'UCL', value: res.uclR, color: cssv('--red'),   width: 2,   dash: [] },
    { label: 'R̄',   value: res.Rb,   color: cssv('--green'), width: 1.6, dash: [7, 4] },
  ];
  if (res.lclR > 0)
    hLines.push({ label: 'LCL', value: res.lclR, color: cssv('--red'), width: 2, dash: [] });

  drawSPCChart(
    canvas,
    res.details.map(d => d.r),
    res.details.map(d => d.oocR),
    hLines,
    res.details.map(d => `x${d.i}`),
    cssv('--purple'),
    'R'
  );

  buildLegend('legend-r', [
    { label: 'Range', color: cssv('--purple') },
    { label: 'UCL',   color: cssv('--red') },
    { label: 'R̄',     color: cssv('--green'), dash: true },
  ]);
}

/* ============================================================
   §11  DEMO DATA
   ============================================================ */
const DEMO = {
  k: 30, n: 5, standard: 14.355, usl: 14.40, lsl: 14.31,
  data: [
    [14.31,14.32,14.32,14.34,14.40],
    [14.35,14.35,14.36,14.41,14.37],
    [14.32,14.35,14.34,14.39,14.31],
    [14.33,14.32,14.30,14.40,14.40],
    [14.35,14.36,14.35,14.35,14.40],
    [14.31,14.30,14.35,14.36,14.33],
    [14.35,14.35,14.37,14.30,14.32],
    [14.30,14.32,14.31,14.39,14.30],
    [14.32,14.31,14.40,14.37,14.30],
    [14.41,14.38,14.36,14.37,14.36],
    [14.40,14.38,14.38,14.33,14.38],
    [14.35,14.36,14.36,14.35,14.36],
    [14.36,14.35,14.33,14.32,14.35],
    [14.36,14.36,14.35,14.31,14.35],
    [14.38,14.38,14.41,14.30,14.40],
    [14.39,14.40,14.32,14.32,14.39],
    [14.39,14.35,14.37,14.13,14.41],
    [14.38,14.35,14.37,14.30,14.37],
    [14.35,14.35,14.31,14.34,14.33],
    [14.36,14.39,14.32,14.34,14.34],
    [14.36,14.38,14.31,14.31,14.38],
    [14.35,14.38,14.38,14.38,14.31],
    [14.36,14.35,14.33,14.37,14.35],
    [14.38,14.36,14.37,14.35,14.34],
    [14.36,14.35,14.33,14.35,14.40],
    [14.35,14.39,14.39,14.40,14.32],
    [14.35,14.36,14.35,14.37,14.32],
    [14.36,14.38,14.34,14.32,14.39],
    [14.36,14.38,14.34,14.32,14.32],
    [14.38,14.39,14.33,14.34,14.32],
  ],
};

function loadDemo() {
  State.set({
    k: DEMO.k, n: DEMO.n,
    standard: DEMO.standard, usl: DEMO.usl, lsl: DEMO.lsl,
    meas: DEMO.data.map(c => [...c]),
    ready: true,
  });
  $('#inp-subgroup').value = DEMO.k;
  $('#inp-n').value        = DEMO.n;
  $('#inp-standard').value = DEMO.standard;
  $('#inp-usl').value      = DEMO.usl;
  $('#inp-lsl').value      = DEMO.lsl;
  buildTable();
  // update all table summaries
  for (let sg = 0; sg < DEMO.k; sg++) updateTableSummary(sg);
  updateColHeaders();
  refreshAll();
  toast('Demo data loaded', 'success');
}

/* ============================================================
   §12  EVENTS
   ============================================================ */
function initEvents() {
  // Generate
  $('#btn-generate').addEventListener('click', () => {
    const k = parseInt($('#inp-subgroup').value, 10);
    const n = parseInt($('#inp-n').value, 10);
    const std = parseFloat($('#inp-standard').value) || null;
    const usl = parseFloat($('#inp-usl').value) || null;
    const lsl = parseFloat($('#inp-lsl').value) || null;

    if (isNaN(k) || k < 2 || k > 50) { toast('Subgroup ต้องอยู่ระหว่าง 2–50', 'error'); return; }
    if (isNaN(n) || n < 2 || n > 10) { toast('n ต้องอยู่ระหว่าง 2–10', 'error'); return; }
    if (!CONSTS[n]) { toast(`ไม่รองรับ n = ${n}`, 'error'); return; }
    if (usl !== null && lsl !== null && usl <= lsl) { toast('USL ต้องมากกว่า LSL', 'error'); return; }

    State.set({ k, n, standard: std, usl, lsl, ready: true });
    State.resetMeas();
    buildTable();
    refreshAll();
    toast(`สร้างตาราง ${k} × ${n} เรียบร้อย`, 'success');
  });

  // Spec changes → recalc
  ['inp-standard','inp-usl','inp-lsl'].forEach(id => {
    $(`#${id}`).addEventListener('change', () => {
      if (!State.get().ready) return;
      State.set({
        standard: parseFloat($('#inp-standard').value) || null,
        usl:      parseFloat($('#inp-usl').value) || null,
        lsl:      parseFloat($('#inp-lsl').value) || null,
      });
      refreshAll();
    });
  });

  $('#btn-demo').addEventListener('click', loadDemo);

  $('#btn-reset').addEventListener('click', () => {
    State.set({ k: 10, n: 5, standard: null, usl: null, lsl: null, meas: [], ready: false });
    ['inp-subgroup','inp-n'].forEach(id => $(`#${id}`).value = id === 'inp-subgroup' ? 10 : 5);
    ['inp-standard','inp-usl','inp-lsl'].forEach(id => $(`#${id}`).value = '');
    const scroll = $('#table-scroll');
    scroll.innerHTML = `<div class="empty-state" id="empty-state">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect x="4" y="4" width="28" height="28" rx="3" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 3"/><path d="M18 13v7M18 24v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <p>กำหนด Subgroup, n แล้วกด Generate Table</p></div>`;
    $('#table-meta').textContent = '';
    refreshAll();
    toast('รีเซ็ตแล้ว', 'info');
  });

  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('spc-theme', next);
    setTimeout(refreshAll, 60);
  });

  // Resize → redraw
  let rzTimer;
  window.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(refreshAll, 120);
  });
}

/* ============================================================
   §13  INIT
   ============================================================ */
function init() {
  const saved = localStorage.getItem('spc-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  initEvents();
  State.set({ k: 10, n: 5 });
  State.resetMeas();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
