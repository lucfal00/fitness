// SVG chart builders (return markup strings) and a shared hover/tap tooltip.
// Marks: 2px lines, 8px dots, 4px rounded bar tops on the baseline, 2px gaps; text uses text tokens only.
import { addDays, weekStart, fromKey } from './logic.js';
import { esc, safeColor, fmtFull, fmtNum, pct, MONTHS, DAY_SHORT } from './ui.js';

// ---- Calendar heatmap (sequential: one hue, quantised opacity) --------

const STEPS = [0.35, 0.55, 0.78, 1];
const level = (v) => STEPS[Math.min(3, Math.ceil(v * 4) - 1)];

function cellStyle(v, color) {
  if (v == null) return 'fill:var(--empty)';
  if (v === 0) return 'fill:var(--track)';
  return `fill:${color};fill-opacity:${level(v)}`;
}

/** valueAt(key) gives null (not applicable) or 0..1. Last 53 weeks ending with today's week.
 *  tipFor(key, v) optionally replaces the default "date · %" tooltip text. */
export function heatmap(valueAt, color, today, tipFor = null) {
  color = safeColor(color);
  const cell = 12;
  const step = cell + 3;
  const top = 18;
  const left = 30;
  const weeks = 53;
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  let cells = '';
  let months = '';
  let lastMonth = -1;
  let lastX = -99;
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(first, 7 * w);
    const x = left + w * step;
    const m = fromKey(ws).getMonth();
    if (m !== lastMonth && x - lastX >= 3 * step) {
      months += `<text x="${x}" y="11">${MONTHS[m]}</text>`;
      lastX = x;
    }
    lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const k = addDays(ws, d);
      if (k > today) break;
      const v = valueAt(k);
      const tip = tipFor ? tipFor(k, v) : `${fmtFull(k)} · ${v == null ? 'non prevista' : pct(v)}`;
      cells += `<rect x="${x}" y="${top + d * step}" width="${cell}" height="${cell}" rx="3" style="${cellStyle(v, color)}" data-tip="${esc(tip)}"/>`;
    }
  }
  const days = [0, 2, 4].map((d) => `<text x="0" y="${top + d * step + 10}">${DAY_SHORT[d]}</text>`).join('');
  const W = left + weeks * step;
  const H = top + 7 * step;
  const swatch = (v) => `<i style="background:${v == null ? 'var(--track)' : color};opacity:${v ?? 1}"></i>`;
  return `<div class="heat-scroll"><svg class="chart heatmap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
      role="img" aria-label="Calendario degli ultimi 12 mesi">${months}${days}${cells}</svg></div>
    <div class="heat-legend">Meno ${swatch(null)}${STEPS.map(swatch).join('')} Più</div>`;
}

// ---- Shared axes frame -------------------------------------------------

const FRAME = { W: 320, H: 160, L: 36, R: 16, T: 14, B: 24 };

/** Labels: every point up to 12 (a full week / year); if the caller left some labels empty it chose them; else every k-th. */
function xLabels(points, x, h = FRAME.H) {
  const chosen = points.some((p) => !p.label);
  const every = points.length <= 12 ? 1 : Math.ceil(points.length / 6);
  return points.map((p, i) => ((chosen ? p.label : (points.length - 1 - i) % every === 0)
    ? `<text x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('');
}

/** One slot per point, centred; shared by the line charts. */
function slots(n) {
  const slot = (FRAME.W - FRAME.L - FRAME.R) / n;
  return { slot, x: (i) => FRAME.L + (i + 0.5) * slot };
}

// ---- Line: free-scale values (weight, e1RM, pace…) ----------------------

/** points: [{ label, tip, value: null | number }]; y axis auto-scaled with 3 labels. overlay (optional): thin
 *  dashed line [{ value }] on the same scale (moving average). */
export function valueLine(points, color, ariaLabel, { unit = '', overlay = null } = {}) {
  color = safeColor(color);
  const { W, H, L, R, T, B } = FRAME;
  const ih = H - T - B;
  const { x } = slots(points.length);
  const vals = [...points, ...(overlay ?? [])].map((p) => p.value).filter((v) => v != null);
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const y = (v) => T + ih * (1 - (v - lo) / (hi - lo));
  const grid = [lo, (lo + hi) / 2, hi].map((g) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}"/>
    <text x="${L - 6}" y="${(y(g) + 3).toFixed(1)}" text-anchor="end">${fmtNum(Math.round(g * 10) / 10)}</text>`).join('');
  const path = (list) => {
    let d = '';
    let pen = false;
    list.forEach((p, i) => {
      if (p.value == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const dotR = points.length > 20 ? 3 : 4;
  let dots = '';
  points.forEach((p, i) => {
    if (p.value == null) return;
    const px = x(i).toFixed(1);
    const py = y(p.value).toFixed(1);
    dots += `<circle cx="${px}" cy="${py}" r="${dotR}" style="fill:${color};stroke:var(--card)" stroke-width="2"/>
      <circle class="hit" cx="${px}" cy="${py}" r="14" data-tip="${esc(`${p.tip} · ${fmtNum(p.value)}${unit ? ` ${unit}` : ''}`)}"/>`;
  });
  const main = path(points);
  const over = overlay ? path(overlay) : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${grid}${xLabels(points, x)}
    ${over ? `<path d="${over}" fill="none" style="stroke:var(--muted)" stroke-width="1.5" stroke-dasharray="3 3"/>` : ''}
    <path d="${main}" fill="none" style="stroke:${color};stroke-opacity:${overlay ? 0.5 : 1}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}

// ---- Bars: value vs optional target (single series) ---------------------

/** points: [{ label, tip, value }]; with a target, bars below it are lighter and it is a dashed line. */
export function barChart(points, target, color, unit, ariaLabel) {
  color = safeColor(color);
  const { W, H, L, R, T, B } = FRAME;
  const iw = W - L - R;
  const ih = H - T - B;
  const max = (Math.max(target ?? 0, ...points.map((p) => p.value)) || 1) * 1.1;
  const y = (v) => T + ih * (1 - v / max);
  const base = y(0);
  const slot = iw / points.length;
  const bw = Math.max(2, slot - 2);
  const x = (i) => L + i * slot + 1;
  let bars = '';
  points.forEach((p, i) => {
    const x0 = x(i);
    if (p.value > 0) {
      const top = y(p.value);
      const r = Math.min(4, bw / 2, base - top);
      bars += `<path d="M${x0} ${base}V${top + r}Q${x0} ${top} ${x0 + r} ${top}H${x0 + bw - r}Q${x0 + bw} ${top} ${x0 + bw} ${top + r}V${base}Z"
        style="fill:${color};fill-opacity:${target == null || p.value >= target ? 1 : 0.45}"/>`;
    }
    bars += `<rect class="hit" x="${x0 - 1}" y="${T}" width="${slot}" height="${ih}" data-tip="${esc(`${p.tip} · ${fmtNum(p.value)} ${unit}`)}"/>`;
  });
  const ty = target == null ? 0 : y(target);
  const tl = target == null ? `<text x="${L - 6}" y="${y(max / 1.1) + 3}" text-anchor="end">${fmtNum(Math.round(max / 1.1))}</text>` : `
    <line class="target" x1="${L}" x2="${W - R}" y1="${ty}" y2="${ty}"/>
    <text x="${L - 6}" y="${ty + 3}" text-anchor="end">${fmtNum(target)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
    <line class="grid" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>
    <text x="${L - 6}" y="${base + 3}" text-anchor="end">0</text>
    ${bars}${tl}
    ${xLabels(points, (i) => x(i) + bw / 2)}</svg>
    ${target == null ? '' : `<div class="heat-legend"><span class="dash"></span> obiettivo ${fmtNum(target)} ${esc(unit)}</div>`}`;
}

// ---- Stacked bars: one bar per entry, one segment per key ---------------

/** series: [{ label, values: { [key]: number } }]; keys: segment order, bottom up;
 *  colors: array parallel to keys, or { [key]: colour }. Tooltip lists the non-zero parts,
 *  named by names[key] when given (keys may then be ids). */
export function stackedBars(series, keys, colors, { ariaLabel = 'Grafico a barre impilate', unit = '', names = {} } = {}) {
  const { W, H, L, R, T, B } = FRAME;
  const iw = W - L - R;
  const ih = H - T - B;
  const colorOf = (k, i) => safeColor(Array.isArray(colors) ? colors[i] : colors[k]);
  const totals = series.map((s) => keys.reduce((a, k) => a + Math.max(0, s.values?.[k] ?? 0), 0));
  const max = (Math.max(0, ...totals) || 1) * 1.1;
  const y = (v) => T + ih * (1 - v / max);
  const base = y(0);
  const slot = iw / Math.max(1, series.length);
  const bw = Math.max(2, slot - 2);
  let bars = '';
  series.forEach((s, i) => {
    const x0 = L + i * slot + 1;
    let acc = 0;
    const parts = [];
    keys.forEach((k, ki) => {
      const v = Math.max(0, s.values?.[k] ?? 0);
      if (!v) return;
      const y1 = y(acc + v);
      const h = y(acc) - y1;
      acc += v;
      parts.push(`${names[k] ?? k} ${fmtNum(v)}`);
      bars += `<rect x="${x0}" y="${y1.toFixed(1)}" width="${bw}" height="${Math.max(0, h - 1).toFixed(1)}" rx="1.5" style="fill:${colorOf(k, ki)}"/>`;
    });
    const tip = `${s.label} · ${parts.length ? `${parts.join(', ')} (tot ${fmtNum(acc)}${unit ? ` ${unit}` : ''})` : 'nessun dato'}`;
    bars += `<rect class="hit" x="${x0 - 1}" y="${T}" width="${slot}" height="${ih}" data-tip="${esc(tip)}"/>`;
  });
  const labels = series.map((s) => ({ label: s.label }));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
    <line class="grid" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>
    <text x="${L - 6}" y="${base + 3}" text-anchor="end">0</text>
    <text x="${L - 6}" y="${y(max / 1.1) + 3}" text-anchor="end">${fmtNum(Math.round(max / 1.1))}</text>
    ${bars}${labels.length ? xLabels(labels, (i) => L + i * slot + 1 + bw / 2) : ''}</svg>`;
}

// ---- Tooltip -----------------------------------------------------------

let tipEl;

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

/** One floating tooltip for every [data-tip] element; hover on desktop, tap on touch. */
export function initTooltips() {
  tipEl = Object.assign(document.createElement('div'), { className: 'tip', hidden: true });
  document.body.append(tipEl);
  const show = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { hideTip(); return; }
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
    const r = t.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    tipEl.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8)}px`;
    tipEl.style.top = `${r.top - h - 8 < 0 ? r.bottom + 8 : r.top - h - 8}px`;
  };
  document.addEventListener('pointerover', show);
  document.addEventListener('click', show);
  addEventListener('scroll', hideTip, { capture: true, passive: true });
}
