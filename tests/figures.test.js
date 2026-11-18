import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rigLerp, rigLerpNamed, figureOf } from '../js/figures.js';
import { emptyDoc } from '../js/logic.js';

const D = emptyDoc();

const BONES = [[2, 4], [2, 0], [2, 6], [6, 8], [2, 10], [10, 12], [4, 14], [14, 16], [4, 18], [18, 20]];
const len = (K, a, b) => Math.hypot(K[a] - K[b], K[a + 1] - K[b + 1]);
const RIG = ['curl_bicipiti_un_braccio', 'rematore_seduto_elastico', 'kickback_elastico', 'plank_gamba_alternata', 'curl_bicipiti_elastico', 'spinta_petto_elastico',
  'curl_femorali_dischi', 'abduzione_fianco', 'plank_laterale_abduzione', 'hip_thrust_una_gamba', 'split_squat_bulgaro', 'reverse_crunch', 'body_saw_dischi',
  'ginocchia_petto', 'gambe_al_muro'];
const NAMED = ['alzate_laterali_elastico', 'alzata_laterale_un_braccio'];
const NBONES = [['SL', 'EL'], ['EL', 'WL'], ['SR', 'ER'], ['ER', 'WR'], ['PL', 'KL'], ['KL', 'FL'], ['PR', 'KR'], ['KR', 'FR']];
const nlen = (K, a, b) => Math.hypot(K[a][0] - K[b][0], K[a][1] - K[b][1]);

test('rig figures keep every bone length through each move', () => {
  for (const id of RIG) {
    const { k } = figureOf(D, `lib_${id}`);
    for (let n = 0; n < k.length; n++) {
      const A = k[n]; const B = k[(n + 1) % k.length];
      for (let s = 0; s <= 20; s++) {
        const P = rigLerp(A, B, s / 20);
        for (const [a, b] of BONES) {
          const want = len(A, a, b) + (len(B, a, b) - len(A, a, b)) * (s / 20);
          assert.ok(Math.abs(len(P, a, b) - want) < 0.05, `${id} bone ${a}-${b} at ${s / 20}: ${len(P, a, b)} vs ${want}`);
        }
      }
    }
  }
});

test('rig keyframes have the same bone lengths in every keyframe', () => {
  for (const id of RIG) {
    const { k } = figureOf(D, `lib_${id}`);
    for (const [a, b] of BONES) {
      const ls = k.map((K) => len(K, a, b));
      assert.ok(Math.max(...ls) - Math.min(...ls) < 0.3, `${id} bone ${a}-${b}: ${ls}`);
    }
  }
});

test('a foot or hand on the floor stays on the floor', () => {
  for (const id of RIG) {
    const { k } = figureOf(D, `lib_${id}`);
    for (let n = 0; n < k.length; n++) {
      const A = k[n]; const B = k[(n + 1) % k.length];
      for (const j of [8, 12, 16, 20]) {
        if (!(A[j + 1] >= 116 && B[j + 1] >= 116)) continue;
        for (let s = 0; s <= 20; s++) {
          const P = rigLerp(A, B, s / 20);
          assert.ok(P[j + 1] >= 116 - 1e-9, `${id} joint ${j} leaves the floor`);
        }
      }
    }
  }
});

test('a planted limb never bends the wrong way (squat: knees stay in front)', () => {
  const { k } = figureOf(D, 'lib_squat_corpo_libero');
  for (const [A, B] of [[k[0], k[1]], [k[1], k[0]]]) {
    for (let s = 0; s <= 20; s++) {
      const P = rigLerp(A, B, s / 20);
      for (const [p, kn, f] of [[4, 14, 16], [4, 18, 20]]) {
        // the knee may not sit behind the hip-ankle line by more than a hair
        const c = (P[f] - P[p]) * (P[kn + 1] - P[p + 1]) - (P[f + 1] - P[p + 1]) * (P[kn] - P[p]);
        assert.ok(c <= 30, `knee ${kn} bends backwards at ${s / 20}: ${c}`);
      }
    }
  }
});

test('no planted knee or elbow flips to the other side mid-move', () => {
  const cross = (P, r, m, x) => (P[x] - P[r]) * (P[m + 1] - P[r + 1]) - (P[x + 1] - P[r + 1]) * (P[m] - P[r]);
  for (const id of RIG) {
    const { k } = figureOf(D, `lib_${id}`);
    for (let n = 0; n < k.length; n++) {
      const A = k[n]; const B = k[(n + 1) % k.length];
      for (const [r, m, x] of [[2, 6, 8], [2, 10, 12], [4, 14, 16], [4, 18, 20]]) {
        const fixed = Math.hypot(A[x] - B[x], A[x + 1] - B[x + 1]) < 0.5 || (A[x + 1] >= 116 && B[x + 1] >= 116);
        if (!fixed) continue;
        const ca = cross(A, r, m, x); const cb = cross(B, r, m, x);
        const sign = Math.sign(Math.abs(ca) >= Math.abs(cb) ? ca : cb);
        for (let s = 0; s <= 20; s++) {
          const c = cross(rigLerp(A, B, s / 20), r, m, x);
          assert.ok(Math.sign(c) === sign || Math.abs(c) < 30, `${id} joint ${m} flips at ${s / 20}: ${c}`);
        }
      }
    }
  }
});

test('a free limb swings on an arc, not a chord', () => {
  const { k } = figureOf(D, 'lib_abduzione_fianco');
  const mid = rigLerp(k[0], k[1], 0.5);
  const hip = [mid[4], mid[5]];
  const reach = Math.hypot(mid[16] - hip[0], mid[17] - hip[1]);
  assert.ok(Math.abs(reach - 46) < 0.1, `straight leg keeps its length: ${reach}`);
});

test('the note adds the equipment worn', () => {
  assert.deepEqual(figureOf(D, 'lib_squat_corpo_libero', 'Con gilet e fascia sopra le ginocchia').props, { vest: true, knee: true });
  assert.deepEqual(figureOf(D, 'lib_dead_bug', 'Con cavigliere').props, { ankle: true });
  assert.equal(figureOf(D, 'lib_squat_corpo_libero', 'Braccia avanti').props, undefined);
  assert.equal(figureOf(D, 'lib_y_prona', 'Con gilet').props, undefined);   // top view: no equipment drawn
  const row = figureOf(D, 'lib_rematore_seduto_elastico', 'Gilet addosso');
  assert.deepEqual(row.props, { ties: [['Fb', 'Wb'], ['Fa', 'Wa']], wrist: true, vest: true });
});

test('a timed figure is not reversed by the note', () => {
  const a = figureOf(D, 'lib_rematore_seduto_elastico');
  const b = figureOf(D, 'lib_rematore_seduto_elastico', 'tira all’indietro');
  assert.deepEqual(a.k, b.k);
});

test('front and top figures keep their bone lengths through each move', () => {
  for (const id of NAMED) {
    const { k, rig } = figureOf(D, `lib_${id}`);
    assert.ok(rig);
    for (const [a, b] of NBONES) {
      const ls = k.map((K) => nlen(K, a, b));
      assert.ok(Math.max(...ls) - Math.min(...ls) < 0.3, `${id} ${a}-${b} keyframes: ${ls}`);
    }
    for (let n = 0; n < k.length; n++) {
      const A = k[n]; const B = k[(n + 1) % k.length];
      for (let s2 = 0; s2 <= 20; s2++) {
        const P = rigLerpNamed(A, B, s2 / 20);
        for (const [a, b] of NBONES) {
          const want = nlen(A, a, b) + (nlen(B, a, b) - nlen(A, a, b)) * (s2 / 20);
          assert.ok(Math.abs(nlen(P, a, b) - want) < 0.05, `${id} ${a}-${b} at ${s2 / 20}`);
        }
      }
    }
  }
});

test('static stretches go into the position once and stay there', () => {
  for (const id of ['torsione_sdraiato', 'ginocchia_petto', 'gambe_al_muro']) assert.equal(figureOf(D, `lib_${id}`).hold, true, id);
  assert.equal(figureOf(D, 'lib_gambe_al_muro').wall > 80, true);
});
