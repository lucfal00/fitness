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
  // jumping jacks, seen from the front: feet together and arms down, then feet apart and arms overhead
  jumping_jack: { view: 'front', ms: 420, k: [
    front({ EL: [70, 61, 0], WL: [68, 79, 0], ER: [110, 61, 0], WR: [112, 79, 0], PL: [84, 80, 0], PR: [96, 80, 0],
      KL: [83, 101, 0], FL: [82, 122, 0], KR: [97, 101, 0], FR: [98, 122, 0] }),
    front({ H: [90, 22, 0], SL: [74, 38, 0], SR: [106, 38, 0], EL: [63, 23, 0], WL: [57, 6, 0], ER: [117, 23, 0], WR: [123, 6, 0],
      PL: [82, 76, 0], PR: [98, 76, 0], KL: [72, 97, 0], FL: [63, 118, 0], KR: [108, 97, 0], FR: [117, 118, 0] })] },
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
  torsione_sdraiato: { view: 'top', sided: true, hold: true, ms: 1800, k: [
    top({ H: [90, 20, 0], SL: [76, 34, 0], SR: [104, 34, 0], EL: [58, 34, 0], WL: [40, 34, 0], ER: [122, 34, 0], WR: [140, 34, 0],
      PL: [83, 74, 0], PR: [97, 74, 0], KL: [84, 92, 18], FL: [84, 108, 0], KR: [96, 92, 18], FR: [96, 108, 0] }),
    top({ H: [90, 20, 0], SL: [76, 34, 0], SR: [104, 34, 0], EL: [58, 34, 0], WL: [40, 34, 0], ER: [122, 34, 0], WR: [140, 34, 0],
      PL: [82, 74, 0], PR: [96, 75, 4], KL: [56, 80, 2], FL: [58, 100, 0], KR: [62, 90, 8], FR: [64, 108, 0] })] },
  // breathing lying on the back, knees bent, hands on the belly that rises
  respiro_sdraiato: { view: 'side', ms: 2200, k: [
    [28, 112, 40, 114, 80, 116, 55, 109, 66, 111, 55, 109, 66, 111, 102, 92, 112, 119, 102, 92, 112, 119],
    [28, 112, 40, 113, 80, 116, 55, 106, 66, 106, 55, 106, 66, 106, 102, 92, 112, 119, 102, 92, 112, 119]] },
  // lying on the back, the knees come to the chest; forearms behind the thighs, hands open (no grip), then hold
  ginocchia_petto: { view: 'side', rig: true, hold: true, ms: 1800, k: [
    [28, 112, 40, 114, 80, 116, 55, 109, 66, 111, 55, 109, 66, 111, 102, 92, 112, 119, 102, 92, 112, 119],
    [28, 112, 40, 114, 80, 116, 47.6, 100.2, 58.8, 100.7, 47.6, 100.2, 58.8, 100.7, 55.1, 95.1, 83.4, 90.1, 55.1, 95.1, 83.4, 90.1]] },
  // legs up the wall: lying on the back, hips close to the wall, straight legs resting on it (body and legs at 90°),
  // arms on the floor
  gambe_al_muro: { view: 'side', wall: 85.6, rig: true, hold: true, ms: 2200, k: [
    [28, 112, 40, 114, 80, 116, 55, 109, 66, 111, 55, 109, 66, 111, 102, 92, 112, 119, 102, 92, 112, 119],
    [28, 112, 40, 114, 80, 116, 55.8, 115.2, 66.9, 116, 55.8, 115.2, 66.9, 116, 81.1, 83.5, 82.1, 54.7, 81.1, 83.5, 82.1, 54.7]] },
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
  squat_corpo_libero: { view: 'side', rig: true, ms: 1300, k: [
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
  // prone W lift that opens into a Y at the top: arms up in a W, reach out to a Y, back to the W, then down
  w_y_prona: { view: 'top', cycle: true, ms: 900, tempo: [1, 0.5, 0.5, 0.8, 0.5, 0.5, 1], k: [
    top({ EL: [63, 54, 0], WL: [58, 30, 0], ER: [117, 54, 0], WR: [122, 30, 0] }),
    top({ H: [90, 24, 3], EL: [66, 57, 6], WL: [61, 32, 8], ER: [114, 57, 6], WR: [119, 32, 8] }),
    top({ H: [90, 24, 3], EL: [59, 42, 6], WL: [47, 22, 9], ER: [121, 42, 6], WR: [133, 22, 9] }),
    top({ H: [90, 24, 3], EL: [66, 26, 5], WL: [55, 12, 9], ER: [114, 26, 5], WR: [125, 12, 9] }),
    top({ H: [90, 24, 3], EL: [66, 26, 5], WL: [55, 12, 9], ER: [114, 26, 5], WR: [125, 12, 9] }),
    top({ H: [90, 24, 3], EL: [59, 42, 6], WL: [47, 22, 9], ER: [121, 42, 6], WR: [133, 22, 9] }),
    top({ H: [90, 24, 3], EL: [66, 57, 6], WL: [61, 32, 8], ER: [114, 57, 6], WR: [119, 32, 8] })],
    alt: { view: 'side', k: [
      [124, 112, 112, 113, 70, 115, 100, 117, 118, 117, 100, 117, 118, 117, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 100, 107, 118, 106, 100, 107, 118, 106, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 118, 105, 136, 102, 118, 105, 136, 102, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 131, 106, 150, 100, 131, 106, 150, 100, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 131, 106, 150, 100, 131, 106, 150, 100, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 118, 105, 136, 102, 118, 105, 136, 102, 45, 116, 20, 117, 45, 116, 20, 117],
      [124, 110, 112, 113, 70, 115, 100, 107, 118, 106, 100, 107, 118, 106, 45, 116, 20, 117, 45, 116, 20, 117]] } },
  wall_slide: { view: 'back', ms: 1200, k: [
    back({ EL: [68, 64, 0], WL: [68, 40, 0], ER: [112, 64, 0], WR: [112, 40, 0] }),
    back({ EL: [66, 34, 0], WL: [58, 12, 0], ER: [114, 34, 0], WR: [122, 12, 0] })] },
  dead_bug: { view: 'side', rig: true, ms: 900, cycle: true, k: [
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 75, 96, 75, 80, 112, 92, 132, 92, 112, 92, 132, 92],
    [62, 110, 75, 112, 112, 114, 58, 108, 42, 108, 75, 96, 75, 80, 112, 92, 132, 92, 134, 110, 156, 111],
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 75, 96, 75, 80, 112, 92, 132, 92, 112, 92, 132, 92],
    [62, 110, 75, 112, 112, 114, 75, 96, 75, 80, 58, 108, 42, 108, 134, 110, 156, 111, 112, 92, 132, 92]],
    alt: { view: 'top', k: [bug({}), bug({ EL: [74, 18, 4], WL: [72, 4, 3], KR: [98, 92, 4], FR: [98, 116, 3] }),
      bug({}), bug({ ER: [106, 18, 4], WR: [108, 4, 3], KL: [82, 92, 4], FL: [82, 116, 3] })] } },
};
// Rigid-bone figures ("rig"): tempo = relative length of each move, slower on the way back, a short hold at the end.
Object.assign(FIGURES, {
  // biceps curl, band under the feet to the wrist cuffs: elbows still, open hands come up
  curl_bicipiti_elastico: { view: 'side', rig: true, cycle: true, ms: 900, tempo: [1, 0.3, 1.5],
    props: { ties: [['Fb', 'Wb'], ['Fa', 'Wa']], wrist: true }, k: [
      [100, 28, 100, 40, 100, 74, 101.1, 53, 101.6, 65.9, 100.7, 53, 100.7, 66, 101.5, 97, 103, 120, 98.5, 97, 97, 120],
      [100, 28, 100, 40, 100, 74, 101.1, 53, 108.6, 42.3, 100.7, 53, 108.5, 42.6, 101.5, 97, 103, 120, 98.5, 97, 97, 120],
      [100, 28, 100, 40, 100, 74, 101.1, 53, 108.6, 42.3, 100.7, 53, 108.5, 42.6, 101.5, 97, 103, 120, 98.5, 97, 97, 120]] },
  // one-arm biceps curl: band under the near foot to the near wrist cuff, the far arm hangs still
  curl_bicipiti_un_braccio: { view: 'side', rig: true, cycle: true, ms: 900, tempo: [1, 0.3, 1.5],
    props: { ties: [['Fa', 'Wa']], wrist: true }, k: [
      [100, 28, 100, 40, 100, 74, 101.1, 53, 101.6, 65.9, 100.7, 53, 100.7, 66, 101.5, 97, 103, 120, 98.5, 97, 97, 120],
      [100, 28, 100, 40, 100, 74, 101.1, 53, 108.6, 42.3, 100.7, 53, 100.7, 66, 101.5, 97, 103, 120, 98.5, 97, 97, 120],
      [100, 28, 100, 40, 100, 74, 101.1, 53, 108.6, 42.3, 100.7, 53, 100.7, 66, 101.5, 97, 103, 120, 98.5, 97, 97, 120]] },
  // lateral raise, seen from the front: band under the feet to the wrist cuffs, arms up to shoulder height
  alzate_laterali_elastico: { view: 'front', rig: true, cycle: true, ms: 900, tempo: [1, 0.3, 1.5],
    props: { ties: [['FR', 'WR'], ['FL', 'WL']], wrist: true }, k: [
      front({ EL: [70.7, 60.7, 0], WL: [68.8, 78.6, 0], ER: [109.3, 60.7, 0], WR: [111.2, 78.6, 0] }),
      front({ EL: [55, 42.7, 0], WL: [37, 42, 0], ER: [125, 42.7, 0], WR: [143, 42, 0] }),
      front({ EL: [55, 42.7, 0], WL: [37, 42, 0], ER: [125, 42.7, 0], WR: [143, 42, 0] })] },
  // one-arm lateral raise (front view): band under the foot on the same side to the cuff of the working wrist, the
  // other arm hangs; "destro" in the note mirrors it
  alzata_laterale_un_braccio: { view: 'front', sided: true, rig: true, cycle: true, ms: 900, tempo: [1, 0.3, 1.5],
    props: { ties: [['FL', 'WL']], wrist: true }, k: [
      front({ EL: [70.7, 60.7, 0], WL: [68.8, 78.6, 0], ER: [109.3, 60.7, 0], WR: [111.2, 78.6, 0] }),
      front({ EL: [55, 42.7, 0], WL: [37, 42, 0], ER: [109.3, 60.7, 0], WR: [111.2, 78.6, 0] }),
      front({ EL: [55, 42.7, 0], WL: [37, 42, 0], ER: [109.3, 60.7, 0], WR: [111.2, 78.6, 0] })] },
  // seated row: legs straight, band around the soles to the wrist cuffs; elbows drive back, trunk still
  rematore_seduto_elastico: { view: 'side', rig: true, cycle: true, ms: 900, tempo: [1, 0.4, 1.5],
    props: { ties: [['Fb', 'Wb'], ['Fa', 'Wa']], wrist: true }, k: [
      [56, 67.2, 57, 79.1, 60, 113, 69.1, 84, 81.1, 88.9, 68.8, 84.6, 80.6, 90.1, 82.9, 115, 106, 117, 82.1, 119.3, 105, 117],
      [56, 67.2, 57, 79.1, 60, 113, 50.9, 90.6, 63.9, 89.7, 50.3, 90.3, 63.3, 90, 82.9, 115, 106, 117, 82.1, 119.3, 105, 117],
      [56, 67.2, 57, 79.1, 60, 113, 50.9, 90.6, 63.9, 89.7, 50.3, 90.3, 63.3, 90, 82.9, 115, 106, 117, 82.1, 119.3, 105, 117]] },
  // triceps kickback: hinged forward, elbows held just above the trunk line, band from the front foot; forearms go straight back
  kickback_elastico: { view: 'side', rig: true, cycle: true, ms: 900, tempo: [1, 0.3, 1.5],
    props: { ties: [['Fa', 'Wb'], ['Fa', 'Wa']], wrist: true }, k: [
      [132.7, 51.6, 122.9, 58.5, 95, 78, 110.5, 62.5, 110.5, 75.5, 110.3, 61.9, 109.6, 74.8, 107.8, 97.1, 110, 120, 100.1, 100.4, 88, 120],
      [132.7, 51.6, 122.9, 58.5, 95, 78, 110.5, 62.5, 98.1, 66.5, 110.3, 61.9, 97.7, 65.2, 107.8, 97.1, 110, 120, 100.1, 100.4, 88, 120],
      [132.7, 51.6, 122.9, 58.5, 95, 78, 110.5, 62.5, 98.1, 66.5, 110.3, 61.9, 97.7, 65.2, 107.8, 97.1, 110, 120, 100.1, 100.4, 88, 120]] },
  // forearm plank lifting one straight leg a little, then the other (the hips must not twist)
  plank_gamba_alternata: { view: 'side', rig: true, cycle: true, ms: 800, tempo: [0.8, 0.7, 0.8, 0.8, 0.7, 0.8], k: [
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 42, 113, 20, 117],
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 41.5, 106.8, 19.2, 105.6, 42, 113, 20, 117],
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 41.5, 106.8, 19.2, 105.6, 42, 113, 20, 117],
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 42, 113, 20, 117],
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 41.5, 106.8, 19.2, 105.6],
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 41.5, 106.8, 19.2, 105.6]] },
  // single-leg hip thrust: upper back on the sofa edge, arms resting open on it, near foot on the floor, far leg held up;
  // the hips rise until they are in line with the trunk, hold, and come down slowly
  hip_thrust_una_gamba: { view: 'side', rig: true, cycle: true, ms: 900, tempo: [1, 0.4, 1.5],
    props: { bench: { x0: 20, x1: 62, y: 101 } }, k: [
      [46.4, 96.4, 58, 99.5, 89.4, 112.5, 45.1, 101.3, 32.1, 100.9, 45, 100.6, 32.1, 99.5, 107.7, 98.5, 116, 120, 101.8, 93.1, 121.2, 105.4],
      [46.4, 96.4, 58, 99.5, 92, 99.5, 45.1, 101.3, 32.1, 100.9, 45, 100.6, 32.1, 99.5, 114.9, 97, 116, 120, 96, 76.8, 118.6, 80.8],
      [46.4, 96.4, 58, 99.5, 92, 99.5, 45.1, 101.3, 32.1, 100.9, 45, 100.6, 32.1, 99.5, 114.9, 97, 116, 120, 96, 76.8, 118.6, 80.8]] },
  // Bulgarian split squat: back foot on the sofa, straight down and up
  split_squat_bulgaro: { view: 'side', rig: true, cycle: true, ms: 1000, tempo: [1.5, 1, 0.3],
    props: { bench: { x0: 50, x1: 76, y: 101 } }, k: [
      [101.8, 32.3, 100.6, 44.2, 97, 78, 99.6, 57.2, 100.1, 70.1, 98.7, 57.1, 98.3, 70.1, 109.6, 97.3, 113, 120, 92.9, 100.6, 70, 99],
      [104.6, 48, 102.1, 59.7, 95, 93, 99.8, 72.5, 98.9, 85.5, 98.9, 72.4, 97.1, 85.2, 117.6, 97.5, 113, 120, 87, 114.5, 70, 99],
      [101.8, 32.3, 100.6, 44.2, 97, 78, 99.6, 57.2, 100.1, 70.1, 98.7, 57.1, 98.3, 70.1, 109.6, 97.3, 113, 120, 92.9, 100.6, 70, 99]] },
  // body saw: forearm plank with the feet on the discs; the body rocks back over the elbows and returns
  body_saw_dischi: { view: 'side', rig: true, cycle: true, ms: 1000, tempo: [1.3, 1.1, 0.3], props: { discs: true }, k: [
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 42, 113, 20, 117],
    [112, 104.4, 100, 105.4, 57, 111.4, 110, 118, 130, 118, 110, 118, 130, 118, 33.7, 114.3, 11.4, 117, 33.7, 114.3, 11.4, 117],
    [120, 101, 108, 102, 65, 108, 110, 118, 130, 118, 110, 118, 130, 118, 42, 113, 20, 117, 42, 113, 20, 117]] },
  // reverse crunch: lying, knees over the hips, then the knees come to the chest and the hips curl up a little
  reverse_crunch: { view: 'side', rig: true, cycle: true, ms: 900, tempo: [1, 0.3, 1.5], k: [
    [28.2, 111.6, 40, 114, 74, 114.5, 53, 117.3, 66, 118.3, 53, 117.3, 66, 118.3, 74, 91.5, 97, 91.5, 74, 91.5, 97, 91.5],
    [28.2, 111.6, 40, 114, 73.7, 109.5, 53, 117.3, 66, 118.3, 53, 117.3, 66, 118.3, 61.5, 90, 79.1, 75.2, 61.5, 90, 79.1, 75.2],
    [28.2, 111.6, 40, 114, 73.7, 109.5, 53, 117.3, 66, 118.3, 53, 117.3, 66, 118.3, 61.5, 90, 79.1, 75.2, 61.5, 90, 79.1, 75.2]] },
  // chest press, band doubled around the upper back (under the armpits) to the wrist cuffs, staggered stance: from the
  // elbows beside the trunk (not behind it, where the band would go slack) to straight arms
  spinta_petto_elastico: { view: 'side', rig: true, cycle: true, ms: 900, tempo: [1, 0.4, 1.5],
    props: { ties: [[['N', -7, 6], 'Wb'], [['N', -7, 6], 'Wa']], wrist: true }, k: [
      [102, 30.4, 100, 42.2, 96, 76, 94.5, 54, 107.5, 52.8, 93.9, 53.7, 106.9, 53.2, 104.9, 97.2, 108, 120, 89, 97.9, 82, 120],
      [102, 30.4, 100, 42.2, 96, 76, 112.9, 43.6, 125.9, 44.9, 112.8, 44.2, 125.7, 46, 104.9, 97.2, 108, 120, 89, 97.9, 82, 120],
      [102, 30.4, 100, 42.2, 96, 76, 112.9, 43.6, 125.9, 44.9, 112.8, 44.2, 125.7, 46, 104.9, 97.2, 108, 120, 89, 97.9, 82, 120]] },
  // hamstring curl: shoulders down, hips up, heels on the discs slide out slowly and pull back in
  curl_femorali_dischi: { view: 'side', rig: true, cycle: true, ms: 1000, tempo: [1.6, 1.1, 0.4],
    props: { discs: true }, k: [
      [28.2, 111.6, 40, 114, 72, 100, 53, 117.3, 66, 118.3, 53, 117.3, 66, 118.3, 94.5, 95.3, 98, 118, 94.5, 95.3, 98, 118],
      [28.2, 111.6, 40, 114, 73.2, 103, 53, 117.3, 66, 118.3, 53, 117.3, 66, 118.3, 95.8, 107, 116, 118, 95.8, 107, 116, 118],
      [28.2, 111.6, 40, 114, 72, 100, 53, 117.3, 66, 118.3, 53, 117.3, 66, 118.3, 94.5, 95.3, 98, 118, 94.5, 95.3, 98, 118]] },
  // side-lying hip abduction, seen from the front: bottom arm stretched along the floor under the head (no weight on the
  // hand or wrist), top hand on the hip, top leg up and down
  abduzione_fianco: { view: 'side', label: 'di fronte', rig: true, cycle: true, ms: 900, tempo: [1, 0.5, 1.5], k: [
    [27.7, 106.2, 38, 112, 72, 114, 50.5, 108.2, 63, 111.5, 25.3, 114.9, 12.3, 114.9, 95, 114.9, 118, 115.8, 95, 115.9, 118, 117.4],
    [27.7, 106.2, 38, 112, 72, 114, 50.5, 108.2, 63, 111.5, 25.3, 114.9, 12.3, 114.9, 91.6, 101.9, 111.1, 89.8, 95, 115.9, 118, 117.4],
    [27.7, 106.2, 38, 112, 72, 114, 50.5, 108.2, 63, 111.5, 25.3, 114.9, 12.3, 114.9, 91.6, 101.9, 111.1, 89.8, 95, 115.9, 118, 117.4]] },
  // side plank with the top leg lifting (front view): hips stay up, the top leg rises and lowers
  plank_laterale_abduzione: { view: 'side', label: 'di fronte', rig: true, cycle: true, ms: 900, tempo: [1, 0.4, 1.4], k: [
    [130, 80, 118, 90, 68, 104, 118, 70, 118, 50, 120, 118, 134, 119, 43.3, 110.2, 20, 116, 43, 111, 18, 119],
    [130, 80, 118, 90, 68, 104, 118, 70, 118, 50, 120, 118, 134, 119, 43.3, 97.8, 20, 92.1, 43, 111, 18, 119],
    [130, 80, 118, 90, 68, 104, 118, 70, 118, 50, 120, 118, 134, 119, 43.3, 97.8, 20, 92.1, 43, 111, 18, 119]] },
});
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
  // equipment named in the note is drawn on the body (side view only): "con gilet", "cavigliere", "fascia", "polsiere"
  const gear = { vest: /gilet/i, ankle: /caviglier/i, knee: /\bfasci[ae]\b/i, wrist: /polsier/i };
  const worn = Object.fromEntries(Object.entries(gear).filter(([, re]) => re.test(note)).map(([k]) => [k, true]));
  if (out && out.view === 'side' && Object.keys(worn).length) out = { ...out, props: { ...out.props, ...worn } };
  if (!out?.cycle || out.tempo || !/indietro|antiorario/i.test(note)) return out;
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
const GEAR = 'var(--accent)';             // equipment: vest, bands, weights, discs

/** Bounding box of every keyframe (with the floor and shadows), padded: [x, y, w, h]. */
function bounds(fig) {
  const pts = [];
  for (const k of fig.k) {
    if (Array.isArray(k)) for (let i = 0; i < k.length; i += 2) pts.push([k[i], k[i + 1]]);
    else for (const [x, y, z] of Object.values(k)) pts.push([x, y], [x + z * 0.45, y + z * 0.63]);
  }
  if (fig.view === 'side') pts.push([pts[0][0], 121]);
  if (fig.wall != null) pts.push([fig.wall - 2, 121]);
  if (fig.props?.bench) pts.push([fig.props.bench.x0, fig.props.bench.y], [fig.props.bench.x1, 121]);
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
  const L = (c, w = 2.8) => el(svg, 'line', { stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' });
  if (fig.view === 'side') {
    const pr = fig.props ?? {};
    el(svg, 'line', { x1: bx, y1: 121, x2: bx + bw, y2: 121, stroke: 'var(--line)', 'stroke-width': 1.5 });
    if (fig.wall != null) el(svg, 'line', { x1: fig.wall, y1: by, x2: fig.wall, y2: 121, stroke: 'var(--muted)', 'stroke-width': 2 });
    // Equipment in the accent colour; the far side's dimmer. Order = depth: elastic behind the body.
    const G = (w, far, cap = 'round') => el(svg, 'line', { stroke: GEAR, 'stroke-width': w, 'stroke-linecap': cap,
      ...(far ? { opacity: 0.5 } : {}) });
    if (pr.bench) {                     // sofa or chair (Bulgarian split squat): a box from its top to the floor
      const { x0, x1, y } = pr.bench;
      el(svg, 'rect', { x: x0, y, width: x1 - x0, height: 121 - y, rx: 3, fill: 'none', stroke: 'var(--muted)', 'stroke-width': 2 });
    }
    // ties: elastic between two points (Fa = near foot, Wb = far wrist...; see end() below)
    const ties = (pr.ties ?? []).map(([a, b]) => [a, b, G(1.8, [a, b].some((j) => typeof j === 'string' && j.endsWith('b')))]);
    const discs = pr.discs ? [0, 1].map((n) => el(svg, 'ellipse', { rx: 7, ry: 1.8, fill: GEAR, ...(n ? {} : { opacity: 0.5 }) })) : [];
    const o = { eb: L(FAR), wb: L(FAR), kb: L(FAR), fb: L(FAR) };
    const cuffs = (far) => ({ ankle: pr.ankle && G(5.5, far, 'butt'), wrist: pr.wrist && G(5, far, 'butt'),
      knee: pr.knee && G(5, far, 'butt') });
    const cb = cuffs(true);
    const vest = pr.vest && G(10);
    if (vest) vest.setAttribute('opacity', 0.45);
    Object.assign(o, { t: L(INK), hn: L(INK), ka: L(INK), fa: L(INK), ea: L(INK), wa: L(INK) });
    const ca = cuffs(false);
    const knot = pr.knee && G(3);
    const head = el(svg, 'circle', { r: 7, fill: 'var(--bg)', stroke: INK, 'stroke-width': 2.6 });
    const at = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    const part = (l, p, q, f0, f1) => { if (l) { const a = at(p, q, f0); const b = at(p, q, f1); line(l, a[0], a[1], b[0], b[1]); } };
    return { svg, paint: (P) => {
      const [hx, hy, nx, ny, px, py, eax, eay, wax, way, ebx, eby, wbx, wby, kax, kay, fax, fay, kbx, kby, fbx, fby] = P;
      line(o.t, nx, ny, px, py); line(o.hn, nx, ny, hx, hy);
      line(o.ea, nx, ny, eax, eay); line(o.wa, eax, eay, wax, way); line(o.eb, nx, ny, ebx, eby); line(o.wb, ebx, eby, wbx, wby);
      line(o.ka, px, py, kax, kay); line(o.fa, kax, kay, fax, fay); line(o.kb, px, py, kbx, kby); line(o.fb, kbx, kby, fbx, fby);
      head.setAttribute('cx', hx); head.setAttribute('cy', hy);
      const N = [nx, ny]; const Pv = [px, py];
      const J = { H: [hx, hy], N, P: Pv, Ea: [eax, eay], Wa: [wax, way], Eb: [ebx, eby], Wb: [wbx, wby],
        Ka: [kax, kay], Fa: [fax, fay], Kb: [kbx, kby], Fb: [fbx, fby] };
      // an end is a joint name, a joint with an offset ['N', dx, dy], or a fixed [x, y]
      const end = (j) => (typeof j === 'string' ? J[j] : typeof j[0] === 'string' ? [J[j[0]][0] + j[1], J[j[0]][1] + j[2]] : j);
      for (const [a, b, l] of ties) { const p = end(a); const q = end(b); line(l, p[0], p[1], q[0], q[1]); }
      discs.forEach((d, n) => { d.setAttribute('cx', n ? fax : fbx); d.setAttribute('cy', 121); });
      part(vest, N, Pv, 0.1, 0.6);
      for (const [c, E, W, K, F] of [[cb, [ebx, eby], [wbx, wby], [kbx, kby], [fbx, fby]], [ca, [eax, eay], [wax, way], [kax, kay], [fax, fay]]]) {
        part(c.ankle, K, F, 0.7, 0.88); part(c.wrist, E, W, 0.8, 0.98); part(c.knee, Pv, K, 0.66, 0.82);
      }
      if (knot) { const a = at(Pv, [kax, kay], 0.74); const b = at(Pv, [kbx, kby], 0.74); line(knot, a[0], a[1], b[0], b[1]); }
    } };
  }
  if (fig.view === 'back') el(svg, 'rect', { x: 20, y: 4, width: 140, height: 118, rx: 4, fill: 'none', stroke: 'var(--line)', 'stroke-width': 2 });
  if (fig.view === 'top' && fig.mat !== false) {   // a mat: the body lies on the floor, seen from above
    el(svg, 'rect', { x: bx + 4, y: by + 2, width: bw - 8, height: bh - 4, rx: 6, fill: 'none', stroke: 'var(--line)',
      'stroke-width': 1.5, 'stroke-dasharray': '5 4' });
  }
  const pr = fig.props ?? {};
  const gear = (w, far) => el(svg, 'line', { stroke: GEAR, 'stroke-width': w, 'stroke-linecap': 'round', ...(far ? { opacity: 0.5 } : {}) });
  const nties = (pr.ties ?? []).map(([a, b]) => [a, b, gear(1.8, [a, b].some((j) => typeof j === 'string' && j.endsWith('R')))]);
  const segs = [['SR', 'ER', FAR], ['ER', 'WR', FAR], ['PR', 'KR', FAR], ['KR', 'FR', FAR],
    ['SL', 'EL', INK], ['EL', 'WL', INK], ['PL', 'KL', INK], ['KL', 'FL', INK]];
  const shadows = segs.map(() => L('var(--line)', 2.8));
  const torso = el(svg, 'polygon', { fill: 'var(--bg)', stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round' });
  const limbs = segs.map((q) => L(q[2]));
  const ncuffs = pr.wrist ? [['ER', 'WR', true], ['EL', 'WL', false]].map(([a, b, far]) => {
    const l = gear(5, far);
    l.setAttribute('stroke-linecap', 'butt');
    return [a, b, l];
  }) : [];
  const head = el(svg, 'circle', { r: 8, fill: 'var(--bg)', stroke: INK, 'stroke-width': 2.6 });
  return { svg, paint: (P) => {
    for (const [a, b, l] of nties) { const p = P[a] ?? a; const q = P[b] ?? b; line(l, p[0], p[1], q[0], q[1]); }
    for (const [a, b, l] of ncuffs) {
      const [x0, y0] = P[a]; const [x1, y1] = P[b];
      line(l, x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.8, x0 + (x1 - x0) * 0.98, y0 + (y1 - y0) * 0.98);
    }
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

const pt = (K, j) => [K[j], K[j + 1]];
const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const angle = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]);
const FLOOR = 116;                      // a hand or foot below this line in both keyframes slides on the floor

/** One limb (root R -> middle -> end) between keyframes a and b, with rigid bones. A free end swings on an arc
 *  (angles interpolated); an end on the floor (fixed, or below FLOOR in both keyframes) stays planted or slides along
 *  it, and the knee / elbow comes from two-bone IK, bending the way it does in the more bent keyframe. Returns [M, X]. */
function limb(R, [ra, ma, xa], [rb, mb, xb], e, floor) {
  const mix = (p, q) => p + (q - p) * e;
  const swing = (root, r0, r1, j0, j1) => {
    const l = mix(dist(r0, j0), dist(r1, j1));
    const a0 = angle(r0, j0);
    const t = a0 + Math.atan2(Math.sin(angle(r1, j1) - a0), Math.cos(angle(r1, j1) - a0)) * e;
    return [root[0] + l * Math.cos(t), root[1] + l * Math.sin(t)];
  };
  if (!(dist(xa, xb) < 0.5 || (floor && xa[1] >= FLOOR && xb[1] >= FLOOR))) {
    const M = swing(R, ra, rb, ma, mb);
    return [M, swing(M, ma, mb, xa, xb)];
  }
  const X = [mix(xa[0], xb[0]), mix(xa[1], xb[1])];
  const l1 = mix(dist(ra, ma), dist(rb, mb));
  const l2 = mix(dist(ma, xa), dist(mb, xb));
  const cross = (r, m, x) => (x[0] - r[0]) * (m[1] - r[1]) - (x[1] - r[1]) * (m[0] - r[0]);
  const ca = cross(ra, ma, xa);
  const cb = cross(rb, mb, xb);
  const side = Math.sign(Math.abs(ca) >= Math.abs(cb) ? ca : cb) || 1;
  const d0 = dist(R, X) || 1e-6;
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = (X[0] - R[0]) / d0;
  const uy = (X[1] - R[1]) / d0;
  return [[R[0] + a * ux - side * h * uy, R[1] + a * uy + side * h * ux], X];
}

/** Side-view interpolation with rigid bones ("rig" figures): the pelvis moves in a straight line, the trunk and head
 *  turn about it and each limb follows limb(). Limbs never shrink mid-move. */
export function rigLerp(A, B, e) {
  const out = new Array(22);
  const put = (j, p) => { out[j] = p[0]; out[j + 1] = p[1]; };
  const P = [A[4] + (B[4] - A[4]) * e, A[5] + (B[5] - A[5]) * e];
  put(4, P);
  const N = limb(P, [pt(A, 4), pt(A, 2), pt(A, 0)], [pt(B, 4), pt(B, 2), pt(B, 0)], e, false);
  put(2, N[0]);
  put(0, N[1]);
  for (const [r, m, x] of [[2, 6, 8], [2, 10, 12], [4, 14, 16], [4, 18, 20]]) {
    const [M, X] = limb(r === 2 ? N[0] : P, [pt(A, r), pt(A, m), pt(A, x)], [pt(B, r), pt(B, m), pt(B, x)], e, true);
    put(m, M);
    put(x, X);
  }
  return out;
}

/** The same for named-joint views (front, back, top): head, shoulders and hips move straight, arms and legs follow
 *  limb() in the drawing plane (height z interpolated). A foot that does not move stays planted. */
export function rigLerpNamed(A, B, e) {
  const out = lerp(A, B, e);
  for (const [r, m, x] of [['SL', 'EL', 'WL'], ['SR', 'ER', 'WR'], ['PL', 'KL', 'FL'], ['PR', 'KR', 'FR']]) {
    const [M, X] = limb(out[r], [A[r], A[m], A[x]], [B[r], B[m], B[x]], e, false);
    out[m] = [...M, out[m][2]];
    out[x] = [...X, out[x][2]];
  }
  return out;
}

/** Animated figure inside `box` (replaces its content), cropped to its movement; with `alt`, a second view beside it,
 *  moving in step (same timing, same keyframe count). Stops once removed from the page. */
export function mountFigure(box, fig) {
  box.textContent = '';
  box.classList.remove('two-views');
  if (!fig) return;
  const list = fig.alt ? [fig, { ...fig.alt, ms: fig.ms, cycle: fig.cycle, tempo: fig.tempo }] : [fig];
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
  // tempo: relative length of each move (keyframe n -> n + 1), e.g. a slow lowering and a quicker lift; ms = length 1
  const w = seq.map((_, n) => fig.tempo?.[n] ?? 1);
  const cum = w.map((_, n) => w.slice(0, n).reduce((a, b) => a + b, 0));
  const W = cum[cum.length - 1] + w[w.length - 1];
  const mixer = (v) => (!v.rig ? lerp : v.view === 'side' ? rigLerp : rigLerpNamed);
  let t0 = null;
  const frame = (t) => {
    if (!views[0].svg.isConnected) return;
    t0 ??= t;
    // "hold" figures go into the position once and stay there (static stretches); the others loop. Always animated
    // (also with "Reduce motion"): the movement is the explanation.
    let n;
    let f;
    if (fig.hold) {
      f = Math.min(t - t0, fig.ms) / fig.ms * 0.999;
      n = 0;
    } else {
      const c = (t / fig.ms) % W;
      n = cum.findLastIndex((x) => x <= c);
      f = (c - cum[n]) / w[n];
    }
    const e = (1 - Math.cos(Math.PI * f)) / 2;
    for (const { v, paint } of views) paint(mixer(v)(v.k[seq[n]], v.k[seq[(n + 1) % seq.length]], e));
    requestAnimationFrame(frame);
  };
  for (const { v, paint } of views) paint(v.k[0]);
  requestAnimationFrame(frame);
}
