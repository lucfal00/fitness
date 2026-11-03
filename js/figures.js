// Animated stick figures that show how an exercise is done (timer screen). Pure SVG, colours from CSS variables:
// the near side (or the left side, seen from above) in the text colour, the far / right side muted.
import { LIBRARY, resolveExercise } from './library.js';

const NS = 'http://www.w3.org/2000/svg';

// Side view: [head, neck, pelvis, near elbow, near hand, far elbow, far hand, near knee, near foot, far knee, far foot] as x, y.
// Top / back view: named joints [x, y, z]; z = height above the floor (draws a shadow).
const top = (o) => ({
  H: [90, 24, 0], SL: [78, 40, 0], SR: [102, 40, 0], PL: [83, 80, 0], PR: [97, 80, 0],
  KL: [84, 101, 0], FL: [85, 122, 0], KR: [96, 101, 0], FR: [95, 122, 0], ...o,
});
const back = (o) => ({
  H: [90, 26, 0], SL: [74, 42, 0], SR: [106, 42, 0], PL: [82, 80, 0], PR: [98, 80, 0],
  KL: [81, 101, 0], FL: [80, 122, 0], KR: [99, 101, 0], FR: [100, 122, 0], ...o,
});

const FIGURES = {
  marcia_sul_posto: { view: 'side', ms: 700, k: [
    [100, 28, 100, 40, 100, 74, 94, 56, 90, 70, 106, 56, 112, 66, 114, 82, 110, 104, 100, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 106, 56, 112, 66, 94, 56, 90, 70, 100, 97, 100, 120, 114, 82, 110, 104]] },
  camminata: { view: 'side', ms: 650, k: [
    [100, 28, 100, 40, 100, 74, 94, 56, 92, 72, 106, 56, 110, 70, 108, 96, 116, 118, 94, 97, 86, 118],
    [100, 28, 100, 40, 100, 74, 106, 56, 110, 70, 94, 56, 92, 72, 94, 97, 86, 118, 108, 96, 116, 118]] },
  rotazioni_spalle: { view: 'side', ms: 600, cycle: true, k: [
    [100, 28, 100, 40, 100, 74, 112, 41, 125, 42, 112, 41, 125, 42, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 100, 28, 100, 15, 100, 28, 100, 15, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 88, 41, 75, 42, 88, 41, 75, 42, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 100, 53, 100, 66, 100, 53, 100, 66, 101, 97, 100, 120, 99, 97, 100, 120]] },
  split_squat: { view: 'side', ms: 1100, k: [
    [98, 26, 98, 38, 98, 72, 90, 58, 96, 72, 106, 58, 100, 72, 110, 95, 122, 120, 82, 95, 68, 117],
    [98, 46, 98, 58, 98, 92, 90, 78, 96, 92, 106, 78, 100, 92, 122, 95, 122, 120, 90, 114, 68, 117]] },
  ponte_glutei: { view: 'side', ms: 1000, k: [
    [28, 112, 40, 114, 80, 116, 55, 108, 66, 110, 55, 108, 66, 110, 102, 92, 112, 119, 102, 92, 112, 119],
    [28, 112, 40, 114, 78, 96, 55, 100, 66, 98, 55, 100, 66, 98, 104, 86, 112, 119, 104, 86, 112, 119]] },
  plank: { view: 'side', ms: 1600, k: [
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 42, 113, 20, 117],
    [120, 100, 108, 101, 65, 106, 110, 118, 130, 118, 110, 118, 130, 118, 42, 112, 20, 117, 42, 112, 20, 117]] },
  y_prona: { view: 'top', ms: 1100, k: [
    top({ EL: [66, 26, 0], WL: [55, 12, 0], ER: [114, 26, 0], WR: [125, 12, 0] }),
    top({ H: [90, 24, 3], EL: [66, 26, 5], WL: [55, 12, 9], ER: [114, 26, 5], WR: [125, 12, 9] })] },
  w_prona: { view: 'top', ms: 1100, k: [
    top({ EL: [63, 54, 0], WL: [58, 30, 0], ER: [117, 54, 0], WR: [122, 30, 0] }),
    top({ H: [90, 24, 3], EL: [66, 57, 6], WL: [61, 32, 8], ER: [114, 57, 6], WR: [119, 32, 8] })] },
  wall_slide: { view: 'back', ms: 1200, k: [
    back({ EL: [68, 64, 0], WL: [68, 40, 0], ER: [112, 64, 0], WR: [112, 40, 0] }),
    back({ EL: [66, 34, 0], WL: [58, 12, 0], ER: [114, 34, 0], WR: [122, 12, 0] })] },
  dead_bug: { view: 'side', ms: 900, cycle: true, k: [
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 75, 96, 75, 80, 112, 92, 132, 92, 112, 92, 132, 92],
    [62, 110, 75, 112, 112, 114, 58, 108, 42, 108, 75, 96, 75, 80, 112, 92, 132, 92, 134, 110, 156, 111],
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 75, 96, 75, 80, 112, 92, 132, 92, 112, 92, 132, 92],
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 58, 108, 42, 108, 134, 110, 156, 111, 112, 92, 132, 92]] },
};
FIGURES.ponte_glutei_isometrico = { ...FIGURES.ponte_glutei, k: [FIGURES.ponte_glutei.k[1], FIGURES.ponte_glutei.k[1]] };

const VIEW_LABELS = { top: 'vista dall’alto', back: 'vista da dietro' };
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim();
const ALIASES = { 'plank sugli avambracci': 'plank', 'ponte glutei': 'ponte_glutei', 'split squat': 'split_squat',
  'y prona': 'y_prona', 'w prona': 'w_prona', 'wall slide': 'wall_slide', 'scivolamento al muro': 'wall_slide' };
const BY_NAME = new Map(LIBRARY.map((e) => [norm(e.name), e.id.slice(4)]));

/** Figure of an exercise (library id, or an own exercise with the same name), or null. */
export function figureOf(doc, exId) {
  const slug = String(exId ?? '').startsWith('lib_') ? exId.slice(4) : null;
  if (slug && FIGURES[slug]) return FIGURES[slug];
  const name = norm(resolveExercise(doc, exId)?.name);
  const s = BY_NAME.get(name) ?? ALIASES[name];
  return (s && FIGURES[s]) || null;
}

const el = (p, t, a) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  p.appendChild(e);
  return e;
};
const line = (l, a, b, c, d) => {
  l.setAttribute('x1', a); l.setAttribute('y1', b); l.setAttribute('x2', c); l.setAttribute('y2', d);
};
const INK = 'var(--text)';
const FAR = 'var(--muted)';

/** Bounding box of every keyframe (with the floor and shadows), padded: [x, y, w, h]. */
function bounds(fig) {
  const pts = [];
  for (const k of fig.k) {
    if (Array.isArray(k)) for (let i = 0; i < k.length; i += 2) pts.push([k[i], k[i + 1]]);
    else for (const [x, y, z] of Object.values(k)) pts.push([x, y], [x + z * 0.45, y + z * 0.63]);
  }
  if (fig.view === 'side') pts.push([pts[0][0], 121]);
  if (fig.view === 'back') pts.push([20, 4], [160, 122]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 10;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return [x0, y0, Math.max(...xs) + pad - x0, Math.max(...ys) + pad - y0];
}

/** Animated figure inside `box` (replaces its content), cropped to its movement; stops once removed from the page. */
export function mountFigure(box, fig) {
  box.textContent = '';
  if (!fig) return;
  const [bx, by, bw, bh] = bounds(fig);
  const svg = el(box, 'svg', { viewBox: `${bx} ${by} ${bw} ${bh}`, 'aria-hidden': 'true' });
  const L = (c, w = 4) => el(svg, 'line', { stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' });
  let paint;
  if (fig.view === 'side') {
    el(svg, 'line', { x1: bx, y1: 121, x2: bx + bw, y2: 121, stroke: 'var(--line)', 'stroke-width': 1.5 });
    const o = { eb: L(FAR), wb: L(FAR), kb: L(FAR), fb: L(FAR), t: L(INK), hn: L(INK), ka: L(INK), fa: L(INK), ea: L(INK), wa: L(INK) };
    const head = el(svg, 'circle', { r: 7.5, fill: 'var(--card)', stroke: INK, 'stroke-width': 3.5 });
    paint = (P) => {
      const [hx, hy, nx, ny, px, py, eax, eay, wax, way, ebx, eby, wbx, wby, kax, kay, fax, fay, kbx, kby, fbx, fby] = P;
      line(o.t, nx, ny, px, py); line(o.hn, nx, ny, hx, hy);
      line(o.ea, nx, ny, eax, eay); line(o.wa, eax, eay, wax, way); line(o.eb, nx, ny, ebx, eby); line(o.wb, ebx, eby, wbx, wby);
      line(o.ka, px, py, kax, kay); line(o.fa, kax, kay, fax, fay); line(o.kb, px, py, kbx, kby); line(o.fb, kbx, kby, fbx, fby);
      head.setAttribute('cx', hx); head.setAttribute('cy', hy);
    };
  } else {
    if (fig.view === 'back') el(svg, 'rect', { x: 20, y: 4, width: 140, height: 118, rx: 4, fill: 'none', stroke: 'var(--line)', 'stroke-width': 2 });
    const segs = [['SR', 'ER', FAR], ['ER', 'WR', FAR], ['PR', 'KR', FAR], ['KR', 'FR', FAR],
      ['SL', 'EL', INK], ['EL', 'WL', INK], ['PL', 'KL', INK], ['KL', 'FL', INK]];
    const shadows = segs.map(() => L('var(--line)', 4));
    const torso = el(svg, 'polygon', { fill: 'var(--card)', stroke: INK, 'stroke-width': 3.5, 'stroke-linejoin': 'round' });
    const limbs = segs.map((q) => L(q[2]));
    const head = el(svg, 'circle', { r: 8.5, fill: 'var(--card)', stroke: INK, 'stroke-width': 3.5 });
    paint = (P) => {
      segs.forEach((q, i) => {
        const a = P[q[0]];
        const b = P[q[1]];
        line(limbs[i], a[0], a[1], b[0], b[1]);
        const za = a[2] * 0.45;
        const zb = b[2] * 0.45;
        line(shadows[i], a[0] + za, a[1] + za * 1.4, b[0] + zb, b[1] + zb * 1.4);
        shadows[i].style.opacity = a[2] + b[2] > 0 ? 1 : 0;
      });
      torso.setAttribute('points', ['SL', 'SR', 'PR', 'PL'].map((k) => P[k].slice(0, 2).join(',')).join(' '));
      head.setAttribute('cx', P.H[0]); head.setAttribute('cy', P.H[1]);
    };
  }
  if (VIEW_LABELS[fig.view]) box.insertAdjacentHTML('beforeend', `<small>${VIEW_LABELS[fig.view]}</small>`);
  const lerp = (A, B, e) => (Array.isArray(A) ? A.map((v, j) => v + (B[j] - v) * e)
    : Object.fromEntries(Object.keys(A).map((k) => [k, A[k].map((v, j) => v + (B[k][j] - v) * e)])));
  const seq = fig.cycle ? fig.k.map((_, i) => i) : [0, 1];
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const frame = (t) => {
    if (!svg.isConnected) return;
    const ph = still ? 0 : t / fig.ms;
    const i = Math.floor(ph) % seq.length;
    const f = ph - Math.floor(ph);
    const e = (1 - Math.cos(Math.PI * f)) / 2;
    paint(lerp(fig.k[seq[i]], fig.k[seq[(i + 1) % seq.length]], e));
    if (!still) requestAnimationFrame(frame);
  };
  paint(fig.k[0]);
  requestAnimationFrame(frame);
}
