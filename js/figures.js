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

// Front view, standing (same joints as the back view, no wall).
const front = (o) => ({ ...back({}), ...o });
const hipsHands = { EL: [64, 62, 0], WL: [80, 78, 0], ER: [116, 62, 0], WR: [100, 78, 0] };

const bug = (o) => ({
  H: [90, 18, 0], SL: [78, 32, 0], SR: [102, 32, 0], PL: [83, 70, 0], PR: [97, 70, 0],
  EL: [77, 33, 10], WL: [76, 34, 22], ER: [103, 33, 10], WR: [104, 34, 22],
  KL: [82, 76, 22], FL: [82, 94, 22], KR: [98, 76, 22], FR: [98, 94, 22], ...o,
});

const FIGURES = {
  // marching with forward shoulder circles: knees alternate while the arms go front, down, back, up
  marcia_cerchi_spalle: { view: 'side', ms: 450, cycle: true, k: [
    [100, 28, 100, 40, 100, 74, 112, 41, 125, 42, 112, 41, 125, 42, 114, 82, 110, 104, 100, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 100, 53, 100, 66, 100, 53, 100, 66, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 88, 41, 75, 42, 88, 41, 75, 42, 100, 97, 100, 120, 114, 82, 110, 104],
    [100, 28, 100, 40, 100, 74, 100, 28, 100, 15, 100, 28, 100, 15, 101, 97, 100, 120, 99, 97, 100, 120]] },
  // chest stretch at the wall behind (as in the photo): lunge stance, back arm on the wall, chest turns forward
  pettorale_muro: { view: 'side', wall: 48, ms: 1600, k: [
    [106, 30, 102, 42, 98, 76, 76, 41, 52, 40, 110, 58, 106, 47, 120, 97, 128, 120, 84, 99, 70, 120],
    [113, 32, 109, 44, 102, 79, 78, 42, 52, 40, 116, 60, 112, 49, 124, 98, 128, 120, 86, 101, 70, 120]] },
  // standing forward fold: hinge at the hips, hands slide down towards the ankles
  piegamento_avanti: { view: 'side', hold: true, ms: 2500, k: [
    [100, 28, 100, 40, 100, 74, 101, 57, 102, 73, 99, 57, 98, 73, 100, 97, 100, 120, 100, 97, 100, 120],
    [111, 104, 112, 92, 96, 74, 110, 104, 106, 116, 109, 104, 104, 116, 99, 97, 100, 120, 99, 97, 100, 120]] },
  // hip circles, seen from the front, hands on the hips
  cerchi_anche: { view: 'front', ms: 500, cycle: true, k: [
    front({ ...hipsHands, PL: [88, 80, 0], PR: [104, 80, 0], WL: [86, 78, 0], WR: [106, 78, 0], KL: [84, 101, 0], KR: [102, 101, 0] }),
    front({ ...hipsHands, PL: [82, 77, 0], PR: [98, 77, 0], KL: [81, 100, 0], KR: [99, 100, 0] }),
    front({ ...hipsHands, PL: [76, 80, 0], PR: [92, 80, 0], WL: [74, 78, 0], WR: [94, 78, 0], KL: [78, 101, 0], KR: [96, 101, 0] }),
    front({ ...hipsHands, PL: [82, 83, 0], PR: [98, 83, 0], KL: [81, 102, 0], KR: [99, 102, 0] })] },
  // standing quad stretch: heel to the glute, the near hand holds the foot, the far arm forward for balance
  quadricipite_in_piedi: { view: 'side', ms: 1600, k: [
    [100, 28, 100, 40, 100, 74, 95, 58, 90, 76, 112, 47, 124, 45, 99, 98, 88, 82, 100, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 96, 58, 93, 73, 112, 47, 124, 45, 99, 98, 92, 76, 100, 97, 100, 120]] },
  // calf raises: the whole body rises on the toes
  calf_corpo_libero: { view: 'side', ms: 900, k: [
    [100, 28, 100, 40, 100, 74, 101, 57, 102, 73, 99, 57, 98, 73, 101, 97, 101, 120, 99, 97, 99, 120],
    [100, 20, 100, 32, 100, 66, 101, 49, 102, 65, 99, 49, 98, 65, 102, 89, 103, 114, 100, 89, 101, 114]] },
  // straight-arm circles, seen from the front: small circles with the arms out to the sides
  cerchi_braccia: { view: 'front', ms: 380, cycle: true, k: [
    front({ EL: [55, 40, 0], WL: [36, 37, 0], ER: [125, 40, 0], WR: [144, 37, 0] }),
    front({ EL: [53, 42, 0], WL: [31, 42, 0], ER: [127, 42, 0], WR: [149, 42, 0] }),
    front({ EL: [55, 44, 0], WL: [36, 47, 0], ER: [125, 44, 0], WR: [144, 47, 0] }),
    front({ EL: [56, 42, 0], WL: [41, 42, 0], ER: [124, 42, 0], WR: [139, 42, 0] })] },
  // reverse lunges, alternating: step back with one leg, back up, then the other
  affondi_corpo_libero: { view: 'side', ms: 900, cycle: true, k: [
    [100, 28, 100, 40, 100, 74, 92, 58, 97, 73, 108, 58, 103, 73, 101, 97, 100, 120, 99, 97, 100, 120],
    [94, 46, 94, 58, 92, 92, 86, 76, 91, 91, 102, 76, 97, 91, 80, 114, 64, 118, 116, 97, 104, 120],
    [100, 28, 100, 40, 100, 74, 92, 58, 97, 73, 108, 58, 103, 73, 101, 97, 100, 120, 99, 97, 100, 120],
    [94, 46, 94, 58, 92, 92, 86, 76, 91, 91, 102, 76, 97, 91, 116, 97, 104, 120, 80, 114, 64, 118]] },
  // breathing standing: arms rise to the sides and overhead on the inhale, come down on the exhale (front view)
  respiro_in_piedi: { view: 'front', ms: 1500, cycle: true, k: [
    front({ EL: [70, 61, 0], WL: [68, 79, 0], ER: [110, 61, 0], WR: [112, 79, 0] }),
    front({ EL: [55, 40, 0], WL: [36, 38, 0], ER: [125, 40, 0], WR: [144, 38, 0] }),
    front({ EL: [68, 22, 0], WL: [80, 6, 0], ER: [112, 22, 0], WR: [100, 6, 0] }),
    front({ EL: [55, 40, 0], WL: [36, 38, 0], ER: [125, 40, 0], WR: [144, 38, 0] })] },
  // low lunge, back knee on the floor, arms overhead: the hips sink forward
  affondo_basso: { view: 'side', ms: 1700, k: [
    [101, 54, 100, 66, 98, 100, 112, 52, 118, 36, 110, 52, 115, 36, 126, 96, 130, 120, 74, 118, 52, 120],
    [106, 56, 105, 68, 104, 104, 116, 53, 120, 37, 114, 53, 117, 37, 130, 96, 130, 120, 76, 118, 52, 120]] },
  // supine twist seen from above: arms in a T, bent knees fall to one side (mirrored for the right side)
  torsione_sdraiato: { view: 'top', sided: true, ms: 1800, k: [
    top({ H: [90, 20, 0], SL: [76, 34, 0], SR: [104, 34, 0], EL: [58, 34, 0], WL: [40, 34, 0], ER: [122, 34, 0], WR: [140, 34, 0],
      PL: [83, 74, 0], PR: [97, 74, 0], KL: [84, 92, 18], FL: [84, 108, 0], KR: [96, 92, 18], FR: [96, 108, 0] }),
    top({ H: [90, 20, 0], SL: [76, 34, 0], SR: [104, 34, 0], EL: [58, 34, 0], WL: [40, 34, 0], ER: [122, 34, 0], WR: [140, 34, 0],
      PL: [82, 74, 0], PR: [96, 75, 4], KL: [56, 80, 2], FL: [58, 100, 0], KR: [62, 90, 8], FR: [64, 108, 0] })] },
  // breathing lying on the back, knees bent, hands on the belly that rises
  respiro_sdraiato: { view: 'side', ms: 2200, k: [
    [28, 112, 40, 114, 80, 116, 55, 109, 66, 111, 55, 109, 66, 111, 102, 92, 112, 119, 102, 92, 112, 119],
    [28, 112, 40, 113, 80, 116, 55, 106, 66, 106, 55, 106, 66, 106, 102, 92, 112, 119, 102, 92, 112, 119]] },
  marcia_sul_posto: { view: 'side', ms: 700, k: [
    [100, 28, 100, 40, 100, 74, 94, 56, 90, 70, 106, 56, 112, 66, 114, 82, 110, 104, 100, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 106, 56, 112, 66, 94, 56, 90, 70, 100, 97, 100, 120, 114, 82, 110, 104]] },
  camminata: { view: 'side', ms: 650, k: [
    [100, 28, 100, 40, 100, 74, 94, 56, 92, 72, 106, 56, 110, 70, 108, 96, 116, 118, 94, 97, 86, 118],
    [100, 28, 100, 40, 100, 74, 106, 56, 110, 70, 94, 56, 92, 72, 94, 97, 86, 118, 108, 96, 116, 118]] },
  rotazioni_spalle: { view: 'side', ms: 600, cycle: true, k: [   // forward circles: front, down, back, up
    [100, 28, 100, 40, 100, 74, 112, 41, 125, 42, 112, 41, 125, 42, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 100, 53, 100, 66, 100, 53, 100, 66, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 88, 41, 75, 42, 88, 41, 75, 42, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 100, 28, 100, 15, 100, 28, 100, 15, 101, 97, 100, 120, 99, 97, 100, 120]] },
  squat_corpo_libero: { view: 'side', ms: 1300, k: [
    [100, 28, 100, 40, 100, 74, 113, 41, 126, 42, 113, 41, 126, 42, 101, 97, 100, 120, 99, 97, 100, 120],
    [108, 50, 104, 62, 84, 92, 117, 62, 130, 63, 117, 62, 130, 63, 110, 95, 100, 120, 109, 96, 100, 120]] },
  oscillazioni_gambe: { view: 'side', ms: 800, k: [
    [100, 28, 100, 40, 100, 74, 92, 58, 97, 73, 108, 58, 103, 73, 118, 92, 134, 108, 100, 97, 100, 120],
    [103, 28, 102, 40, 100, 74, 94, 58, 98, 73, 110, 58, 104, 73, 88, 95, 72, 112, 100, 97, 100, 120]] },
  // seen from above, standing: shoulders and arms turn, hips stay still
  torsioni_busto: { view: 'top', mat: false, ms: 900, alt: { view: 'side', k: [
    [100, 28, 100, 40, 100, 74, 111, 41, 122, 42, 89, 41, 78, 42, 101, 97, 100, 120, 99, 97, 100, 120],
    [100, 28, 100, 40, 100, 74, 89, 41, 78, 42, 111, 41, 122, 42, 101, 97, 100, 120, 99, 97, 100, 120]] }, k: [
    top({ H: [90, 65, 0], SL: [76.1, 57, 0], SR: [103.9, 73, 0], EL: [63.6, 49.8, 0], WL: [51.1, 42.6, 0], ER: [116.4, 80.2, 0], WR: [128.9, 87.4, 0], PL: [81, 65, 0], PR: [99, 65, 0], KL: [81, 66, 0], FL: [81, 67, 0], KR: [99, 66, 0], FR: [99, 67, 0] }),
    top({ H: [90, 65, 0], SL: [76.1, 73, 0], SR: [103.9, 57, 0], EL: [63.6, 80.2, 0], WL: [51.1, 87.4, 0], ER: [116.4, 49.8, 0], WR: [128.9, 42.6, 0], PL: [81, 65, 0], PR: [99, 65, 0], KL: [81, 66, 0], FL: [81, 67, 0], KR: [99, 66, 0], FR: [99, 67, 0] })] },
  split_squat: { view: 'side', ms: 1100, k: [
    [98, 26, 98, 38, 98, 72, 90, 58, 96, 72, 106, 58, 100, 72, 110, 95, 122, 120, 82, 95, 68, 117],
    [98, 46, 98, 58, 98, 92, 90, 78, 96, 92, 106, 78, 100, 92, 122, 95, 122, 120, 90, 114, 68, 117]] },
  ponte_glutei: { view: 'side', ms: 1000, k: [
    [28, 112, 40, 114, 80, 116, 55, 108, 66, 110, 55, 108, 66, 110, 102, 92, 112, 119, 102, 92, 112, 119],
    [28, 112, 40, 114, 78, 96, 55, 100, 66, 98, 55, 100, 66, 98, 104, 86, 112, 119, 104, 86, 112, 119]] },
  plank: { view: 'side', ms: 1600, k: [
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 42, 113, 20, 117],
    [120, 100, 108, 101, 65, 106, 110, 118, 130, 118, 110, 118, 130, 118, 42, 112, 20, 117, 42, 112, 20, 117]] },
  // seen from the front: forearm on the floor under the shoulder, top arm to the ceiling, hips rising from the floor
  plank_laterale: { view: 'side', label: 'di fronte', ms: 1400, k: [
    [130, 82, 118, 92, 68, 112, 120, 118, 134, 119, 118, 72, 118, 52, 44, 117, 18, 119, 44, 115, 20, 116],
    [130, 80, 118, 90, 68, 104, 120, 118, 134, 119, 118, 70, 118, 50, 43, 111, 18, 119, 43, 109, 20, 116]],
    alt: { view: 'side', label: 'più facile: ginocchia a terra', k: [
      [130, 84, 118, 94, 80, 114, 120, 118, 134, 119, 118, 74, 118, 54, 52, 118, 40, 116, 52, 117, 41, 114],
      [130, 82, 118, 92, 80, 106, 120, 118, 134, 119, 118, 72, 118, 52, 52, 118, 40, 116, 52, 117, 41, 114]] } },
  y_prona: { view: 'top', ms: 1100, k: [
    top({ EL: [66, 26, 0], WL: [55, 12, 0], ER: [114, 26, 0], WR: [125, 12, 0] }),
    top({ H: [90, 24, 3], EL: [66, 26, 5], WL: [55, 12, 9], ER: [114, 26, 5], WR: [125, 12, 9] })],
    alt: { view: 'side', k: [[124, 112, 112, 113, 70, 115, 131, 112, 150, 112, 131, 112, 150, 112, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 131, 106, 150, 100, 131, 106, 150, 100, 45, 116, 20, 117, 45, 116, 20, 117]] } },
  w_prona: { view: 'top', ms: 1100, k: [
    top({ EL: [63, 54, 0], WL: [58, 30, 0], ER: [117, 54, 0], WR: [122, 30, 0] }),
    top({ H: [90, 24, 3], EL: [66, 57, 6], WL: [61, 32, 8], ER: [114, 57, 6], WR: [119, 32, 8] })],
    alt: { view: 'side', k: [[124, 112, 112, 113, 70, 115, 100, 117, 118, 117, 100, 117, 118, 117, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 100, 107, 118, 106, 100, 107, 118, 106, 45, 116, 20, 117, 45, 116, 20, 117]] } },
  wall_slide: { view: 'back', ms: 1200, k: [
    back({ EL: [68, 64, 0], WL: [68, 40, 0], ER: [112, 64, 0], WR: [112, 40, 0] }),
    back({ EL: [66, 34, 0], WL: [58, 12, 0], ER: [114, 34, 0], WR: [122, 12, 0] })] },
  dead_bug: { view: 'side', ms: 900, cycle: true, k: [
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 75, 96, 75, 80, 112, 92, 132, 92, 112, 92, 132, 92],
    [62, 110, 75, 112, 112, 114, 58, 108, 42, 108, 75, 96, 75, 80, 112, 92, 132, 92, 134, 110, 156, 111],
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 75, 96, 75, 80, 112, 92, 132, 92, 112, 92, 132, 92],
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 58, 108, 42, 108, 134, 110, 156, 111, 112, 92, 132, 92]],
    alt: { view: 'top', k: [bug({}), bug({ EL: [74, 18, 4], WL: [72, 4, 3], KR: [98, 92, 4], FR: [98, 116, 3] }),
      bug({}), bug({ ER: [106, 18, 4], WR: [108, 4, 3], KL: [82, 92, 4], FL: [82, 116, 3] })] } },
};
FIGURES.ponte_glutei_isometrico = { ...FIGURES.ponte_glutei, k: [FIGURES.ponte_glutei.k[1], FIGURES.ponte_glutei.k[1]] };

const VIEW_LABELS = { top: 'dall’alto', back: 'da dietro', front: 'di fronte' };
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim();
const ALIASES = { 'plank sugli avambracci': 'plank', 'ponte glutei': 'ponte_glutei', 'split squat': 'split_squat',
  'y prona': 'y_prona', 'w prona': 'w_prona', 'wall slide': 'wall_slide', 'scivolamento al muro': 'wall_slide' };
const BY_NAME = new Map(LIBRARY.map((e) => [norm(e.name), e.id.slice(4)]));

/** Figure of an exercise (library id, or an own exercise with the same name), or null. A circular movement plays
 *  backwards when the item's note says so ("indietro", "antiorario"). */
export function figureOf(doc, exId, note = '') {
  const slug = String(exId ?? '').startsWith('lib_') ? exId.slice(4) : null;
  const name = norm(resolveExercise(doc, exId)?.name);
  const s = slug && FIGURES[slug] ? slug : BY_NAME.get(name) ?? ALIASES[name];
  const fig = (s && FIGURES[s]) || null;
  let out = fig;
  if (fig?.sided && /destr/i.test(note)) {
    const flip = (k) => Object.fromEntries(Object.entries(k).map(([j, [x, y, z]]) => [j, [180 - x, y, z]]));
    out = { ...fig, k: fig.k.map(flip) };
  }
  if (!out?.cycle || !/indietro|antiorario/i.test(note)) return out;
  return { ...out, k: [...out.k].reverse(), ...(out.alt ? { alt: { ...out.alt, k: [...out.alt.k].reverse() } } : {}) };
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
  if (fig.wall != null) pts.push([fig.wall - 2, 121]);
  if (fig.view === 'back') pts.push([20, 4], [160, 122]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 10;
  const MIN = 96;                       // lying figures keep the scale of standing ones (no giant heads)
  let x0 = Math.min(...xs) - pad;
  let w = Math.max(...xs) + pad - x0;
  let y1 = Math.max(...ys) + pad;
  let h = y1 - (Math.min(...ys) - pad);
  if (h < MIN) h = MIN;                 // grow upwards: the floor stays at the bottom
  if (w < MIN) { x0 -= (MIN - w) / 2; w = MIN; }
  return [x0, y1 - h, w, h];
}

/** One view inside `box`: its svg and a paint(P) function. */
function buildView(box, fig) {
  const [bx, by, bw, bh] = bounds(fig);
  const svg = el(box, 'svg', { viewBox: `${bx} ${by} ${bw} ${bh}`, 'aria-hidden': 'true' });
  const L = (c, w = 4) => el(svg, 'line', { stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' });
  if (fig.view === 'side') {
    el(svg, 'line', { x1: bx, y1: 121, x2: bx + bw, y2: 121, stroke: 'var(--line)', 'stroke-width': 1.5 });
    if (fig.wall != null) el(svg, 'line', { x1: fig.wall, y1: by, x2: fig.wall, y2: 121, stroke: 'var(--muted)', 'stroke-width': 3 });
    const o = { eb: L(FAR), wb: L(FAR), kb: L(FAR), fb: L(FAR), t: L(INK), hn: L(INK), ka: L(INK), fa: L(INK), ea: L(INK), wa: L(INK) };
    const head = el(svg, 'circle', { r: 7.5, fill: 'var(--card)', stroke: INK, 'stroke-width': 3.5 });
    return { svg, paint: (P) => {
      const [hx, hy, nx, ny, px, py, eax, eay, wax, way, ebx, eby, wbx, wby, kax, kay, fax, fay, kbx, kby, fbx, fby] = P;
      line(o.t, nx, ny, px, py); line(o.hn, nx, ny, hx, hy);
      line(o.ea, nx, ny, eax, eay); line(o.wa, eax, eay, wax, way); line(o.eb, nx, ny, ebx, eby); line(o.wb, ebx, eby, wbx, wby);
      line(o.ka, px, py, kax, kay); line(o.fa, kax, kay, fax, fay); line(o.kb, px, py, kbx, kby); line(o.fb, kbx, kby, fbx, fby);
      head.setAttribute('cx', hx); head.setAttribute('cy', hy);
    } };
  }
  if (fig.view === 'back') el(svg, 'rect', { x: 20, y: 4, width: 140, height: 118, rx: 4, fill: 'none', stroke: 'var(--line)', 'stroke-width': 2 });
  if (fig.view === 'top' && fig.mat !== false) {   // a mat: the body lies on the floor, seen from above
    el(svg, 'rect', { x: bx + 4, y: by + 2, width: bw - 8, height: bh - 4, rx: 6, fill: 'none', stroke: 'var(--line)',
      'stroke-width': 1.5, 'stroke-dasharray': '5 4' });
  }
  const segs = [['SR', 'ER', FAR], ['ER', 'WR', FAR], ['PR', 'KR', FAR], ['KR', 'FR', FAR],
    ['SL', 'EL', INK], ['EL', 'WL', INK], ['PL', 'KL', INK], ['KL', 'FL', INK]];
  const shadows = segs.map(() => L('var(--line)', 4));
  const torso = el(svg, 'polygon', { fill: 'var(--card)', stroke: INK, 'stroke-width': 3.5, 'stroke-linejoin': 'round' });
  const limbs = segs.map((q) => L(q[2]));
  const head = el(svg, 'circle', { r: 8.5, fill: 'var(--card)', stroke: INK, 'stroke-width': 3.5 });
  return { svg, paint: (P) => {
    segs.forEach((q, n) => {
      const a = P[q[0]];
      const b = P[q[1]];
      line(limbs[n], a[0], a[1], b[0], b[1]);
      const za = a[2] * 0.45;
      const zb = b[2] * 0.45;
      line(shadows[n], a[0] + za, a[1] + za * 1.4, b[0] + zb, b[1] + zb * 1.4);
      shadows[n].style.opacity = a[2] + b[2] > 0 ? 1 : 0;
    });
    torso.setAttribute('points', ['SL', 'SR', 'PR', 'PL'].map((k) => P[k].slice(0, 2).join(',')).join(' '));
    head.setAttribute('cx', P.H[0]); head.setAttribute('cy', P.H[1]);
  } };
}

const lerp = (A, B, e) => (Array.isArray(A) ? A.map((v, j) => v + (B[j] - v) * e)
  : Object.fromEntries(Object.keys(A).map((k) => [k, A[k].map((v, j) => v + (B[k][j] - v) * e)])));

/** Animated figure inside `box` (replaces its content), cropped to its movement; with `alt`, a second view beside it,
 *  moving in step (same timing, same keyframe count). Stops once removed from the page. */
export function mountFigure(box, fig) {
  box.textContent = '';
  box.classList.remove('two-views');
  if (!fig) return;
  const list = fig.alt ? [fig, { ...fig.alt, ms: fig.ms, cycle: fig.cycle }] : [fig];
  box.classList.toggle('two-views', list.length > 1);
  const views = list.map((v) => {
    const wrap = document.createElement('div');
    wrap.className = 'fig-view';
    box.appendChild(wrap);
    const out = { v, ...buildView(wrap, v) };
    const label = v.label ?? (list.length > 1 && v.view === 'side' ? 'di lato' : VIEW_LABELS[v.view]);
    if (label) wrap.insertAdjacentHTML('beforeend', `<small>${label}</small>`);
    return out;
  });
  const seq = fig.cycle ? fig.k.map((_, n) => n) : [0, 1];
  let t0 = null;
  const frame = (t) => {
    if (!views[0].svg.isConnected) return;
    t0 ??= t;
    // "hold" figures go into the position once and stay there (static stretches); the others loop. Always animated
    // (also with "Reduce motion"): the movement is the explanation.
    const ph = fig.hold ? Math.min(t - t0, fig.ms) / fig.ms * 0.999 : t / fig.ms;
    const n = Math.floor(ph) % seq.length;
    const f = ph - Math.floor(ph);
    const e = (1 - Math.cos(Math.PI * f)) / 2;
    for (const { v, paint } of views) paint(lerp(v.k[seq[n]], v.k[seq[(n + 1) % seq.length]], e));
    requestAnimationFrame(frame);
  };
  for (const { v, paint } of views) paint(v.k[0]);
  requestAnimationFrame(frame);
}
