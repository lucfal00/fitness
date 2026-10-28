import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/metrics.js';
import { resolveExercise } from '../js/library.js';
import { emptyDoc } from '../js/logic.js';

const noon = (date) => new Date(`${date}T12:00:00`).getTime();
const set = (o = {}) => ({ w: false, kg: null, reps: null, sec: null, km: null, rpe: null, done: true, ...o });
const sess = (date, items, o = {}) => ({
  id: `s_${date}_${Math.random()}`, date, start: noon(date), end: noon(date) + 3600000,
  tpl: null, rot: null, deleted: false, items, ...o,
});
const item = (ex, sets) => ({ ex, group: null, note: '', sets });
const docWith = (sessions = [], body = {}) => {
  const d = emptyDoc();
  d.sessions = sessions;
  d.body = body;
  return d;
};
const ex = (id) => resolveExercise(emptyDoc(), id);

const BENCH = 'lib_panca_piana';
const PUSHUP = 'lib_piegamenti';
const PLANK = 'lib_plank';
const RUN = 'lib_corsa';
const PADEL = 'lib_padel';
const SQUAT = 'lib_squat';

test('setVolume', () => {
  assert.equal(M.setVolume(ex(BENCH), set({ kg: 60, reps: 8 }), undefined), 480);
  assert.equal(M.setVolume(ex(BENCH), set({ kg: 60, reps: 8, w: true }), undefined), null);
  assert.equal(M.setVolume(ex(BENCH), set({ kg: 60, reps: 8, done: false }), undefined), null);
  assert.equal(M.setVolume(ex(PUSHUP), set({ kg: 10, reps: 10 }), 78.4), 884);
  assert.equal(M.setVolume(ex(PUSHUP), set({ reps: 10 }), 78.4), 784);
  assert.equal(M.setVolume(ex(PUSHUP), set({ kg: 10, reps: 10 }), undefined), null);
  assert.equal(M.setVolume(ex(PLANK), set({ sec: 60 }), 78), null);
  assert.equal(M.setVolume(ex(RUN), set({ sec: 600, km: 2 }), 78), null);
  assert.equal(M.setVolume(ex(PADEL), set({ sec: 3600 }), 78), null);
});

test('bodyWeightAt', () => {
  const doc = docWith([], { '2026-10-01': { kg: 80 }, '2026-10-20': { kg: 78 } });
  assert.equal(M.bodyWeightAt(doc, '2026-10-19'), 80);
  assert.equal(M.bodyWeightAt(doc, '2026-10-20'), 78);
  assert.equal(M.bodyWeightAt(doc, '2026-09-30'), undefined);
});

test('sessionVolume uses body weight of the session date', () => {
  const s = sess('2026-10-21', [item(BENCH, [set({ kg: 60, reps: 8 })]), item(PUSHUP, [set({ reps: 10 })])]);
  const doc = docWith([s], { '2026-10-20': { kg: 78 } });
  assert.equal(M.sessionVolume(doc, s), 480 + 780);
});

test('groupSets', () => {
  const s = sess('2026-10-21', [item(BENCH, [
    set({ w: true, kg: 20, reps: 10 }), set({ kg: 60, reps: 8 }), set({ kg: 60, reps: 8 }), set({ kg: 60, reps: 8 }),
  ])]);
  assert.deepEqual(M.groupSets(docWith([s]), [s]), { petto: 3, tricipiti: 1.5, spalle: 1.5 });
  const c = sess('2026-10-22', [item(RUN, [set({ sec: 600, km: 2 })])]);
  assert.deepEqual(M.groupSets(docWith([c]), [c]), {});
});

test('bodyMapLevel', () => {
  const lv = [[0, 0], [4, 1], [5, 2], [9.5, 2], [10, 3], [14.5, 3], [15, 4]];
  for (const [n, l] of lv) assert.equal(M.bodyMapLevel(n), l, String(n));
});

test('e1rm', () => {
  assert.equal(M.e1rm(100, 1), 100);
  assert.equal(M.e1rm(100, 12), 140);
  assert.equal(M.e1rm(100, 13), null);
  assert.equal(M.e1rm(60, 8), 76);
});

test('exerciseHistory orders concluded sessions by start', () => {
  const a = sess('2026-10-02', [item(BENCH, [set({ kg: 60, reps: 8 })])]);
  const b = sess('2026-10-01', [item(BENCH, [set({ kg: 60, reps: 8 })])]);
  const open = sess('2026-10-03', [item(BENCH, [])], { end: null });
  const del = sess('2026-10-04', [item(BENCH, [])], { deleted: true });
  const other = sess('2026-10-05', [item(SQUAT, [])]);
  const h = M.exerciseHistory(docWith([a, b, open, del, other]), BENCH);
  assert.deepEqual(h.map((x) => x.session), [b, a]);
  assert.equal(h[0].item, b.items[0]);
});

test('records and sessionRecords', () => {
  const s1 = sess('2026-10-01', [item(BENCH, [set({ kg: 60, reps: 8 })])]);
  const s2 = sess('2026-10-08', [item(BENCH, [set({ kg: 62.5, reps: 8 })])]);
  const s3 = sess('2026-10-15', [item(BENCH, [set({ kg: 62.5, reps: 8 })])]);
  const doc = docWith([s1, s2, s3]);
  const r = M.records(doc, BENCH);
  assert.equal(r.maxKg, 62.5);
  assert.equal(r.repMax[8], 62.5);
  assert.equal(r.repMax[5], 62.5);
  assert.equal(r.repMax[9], null);
  assert.equal(r.volume, 500);
  assert.equal(M.records(doc, BENCH, { before: s2.start }).maxKg, 60);

  const a = M.sessionRecords(doc, s2);
  const kg = a.records.find((x) => x.ex === BENCH && x.kind === 'maxKg');
  assert.equal(kg.value, 62.5);
  assert.equal(kg.prev, 60);
  assert.deepEqual(a.firsts, []);

  const f = M.sessionRecords(doc, s1);
  assert.deepEqual(f.firsts, [BENCH]);
  assert.deepEqual(f.records, []);

  const c = M.sessionRecords(doc, s3);
  assert.ok(!c.records.some((x) => x.kind === 'maxKg'));
});

test('records for body, cardio and sport', () => {
  const doc = docWith([
    sess('2026-10-01', [
      item(PUSHUP, [set({ reps: 15 })]),
      item(PLANK, [set({ sec: 60 })]),
      item(RUN, [set({ sec: 300, km: 0.8 }), set({ sec: 1500, km: 5 })]),
      item(PADEL, [set({ sec: 3600 })]),
    ]),
  ], { '2026-09-01': { kg: 80 } });
  assert.equal(M.records(doc, PUSHUP).maxReps, 15);
  assert.equal(M.records(doc, PLANK).maxSec, 60);
  const run = M.records(doc, RUN);
  assert.equal(run.maxKm, 5);
  assert.equal(run.bestPace, 300);
  assert.equal(M.records(doc, PADEL).maxSec, 3600);
  const short = docWith([sess('2026-10-01', [item(RUN, [set({ sec: 200, km: 0.8 })])])]);
  assert.equal(M.records(short, RUN).bestPace, null);
});

const tplItem = (exId, sets, o = {}) => ({ ex: exId, group: null, rest: 90, note: '', sets, ...o });

test('suggestSets weight', () => {
  const t = tplItem(BENCH, [{ reps: [8, 10], kg: 60 }, { reps: [8, 10], kg: 60 }, { reps: [8, 10], kg: 60 }]);
  const none = M.suggestSets(docWith(), BENCH, t, 2.5);
  assert.equal(none.length, 3);
  assert.equal(none[0].kg, 60);
  assert.equal(none[0].reps, 8);
  assert.equal(none[0].tag, undefined);

  const up = docWith([sess('2026-10-01', [item(BENCH, [
    set({ kg: 60, reps: 10 }), set({ kg: 60, reps: 10 }), set({ kg: 60, reps: 10 }),
  ])])]);
  const r = M.suggestSets(up, BENCH, t, 2.5);
  assert.equal(r.length, 3);
  for (const x of r) assert.deepEqual([x.kg, x.reps, x.tag, x.w], [62.5, 8, '+2,5 kg', false]);

  const same = docWith([sess('2026-10-01', [item(BENCH, [
    set({ kg: 60, reps: 10 }), set({ kg: 60, reps: 9 }), set({ kg: 60, reps: 8 }),
  ])])]);
  const q = M.suggestSets(same, BENCH, t, 2.5);
  assert.deepEqual(q.map((x) => x.reps), [10, 10, 9]);
  assert.deepEqual(q.map((x) => x.kg), [60, 60, 60]);
  assert.deepEqual(q.map((x) => x.tag), [undefined, '+1 rip', '+1 rip']);
});

test('suggestSets copies warm-ups and ignores them in history', () => {
  const t = tplItem(BENCH, [{ w: true, reps: [10, 10], kg: 40 }, { reps: [8, 10], kg: 60 }]);
  const doc = docWith([sess('2026-10-01', [item(BENCH, [set({ w: true, kg: 40, reps: 10 }), set({ kg: 60, reps: 10 })])])]);
  const r = M.suggestSets(doc, BENCH, t, 2.5);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].w, r[0].kg, r[0].reps, r[0].tag], [true, 40, 10, undefined]);
  assert.deepEqual([r[1].w, r[1].kg, r[1].reps, r[1].tag], [false, 62.5, 8, '+2,5 kg']);
});

test('suggestSets body, cardio, no template', () => {
  const doc = docWith([sess('2026-10-01', [
    item(PUSHUP, [set({ reps: 12 })]), item(PLANK, [set({ sec: 30 })]), item(RUN, [set({ sec: 1500, km: 5 })]),
  ])]);
  const p = M.suggestSets(doc, PUSHUP, tplItem(PUSHUP, [{ reps: [8, 15] }]), 2.5);
  assert.deepEqual([p[0].reps, p[0].tag], [13, '+1 rip']);
  const t = M.suggestSets(doc, PLANK, tplItem(PLANK, [{ sec: 30 }]), 2.5);
  assert.deepEqual([t[0].sec, t[0].tag], [35, '+5 s']);
  const c = M.suggestSets(doc, RUN, tplItem(RUN, [{ km: 3, sec: 900 }]), 2.5);
  assert.deepEqual([c[0].km, c[0].sec, c[0].tag], [5, 1500, undefined]);
  const hist = docWith([sess('2026-10-01', [item(BENCH, [set({ kg: 50, reps: 8 }), set({ kg: 50, reps: 7 })])])]);
  const free = M.suggestSets(hist, BENCH, null, 2.5);
  assert.deepEqual(free.map((x) => [x.kg, x.reps, x.tag]), [[52.5, 8, '+2,5 kg'], [52.5, 7, '+2,5 kg']]);
});

test('pace', () => {
  assert.equal(M.pace(1500, 5), '5:00');
  assert.equal(M.pace(1590, 5), '5:18');
});

test('estimateMinutes', () => {
  const doc = emptyDoc();
  const sets3 = [{ reps: [8, 10] }, { reps: [8, 10] }, { reps: [8, 10] }];
  const tpl = {
    items: [
      tplItem(BENCH, sets3, { rest: 90 }),
      tplItem(SQUAT, sets3, { rest: 60, group: 'g1' }),
      tplItem('lib_stacco_rumeno', sets3, { rest: 60, group: 'g1' }),
      tplItem(RUN, [{ sec: 1200 }]),
    ],
  };
  assert.equal(M.estimateMinutes(doc, tpl, 90), 35);
  assert.equal(M.estimateMinutes(doc, { items: [tplItem(BENCH, sets3, { rest: 90 })] }, 90), 5);
});

test('sessionExerciseStats: per-session maxima, sums and pace basis', () => {
  const doc = emptyDoc();
  const st = (o) => ({ w: false, kg: null, reps: null, sec: null, km: null, rpe: null, done: true, ...o });
  const s = {
    id: 's1', date: '2026-10-20', start: 1, end: 2, tpl: null, rot: null, rpe: null, deleted: false,
    items: [
      { ex: RUN, group: null, note: '', sets: [st({ km: 5, sec: 1500 }), st({ km: 0.5, sec: 100 }), st({ km: 3, sec: 900, w: true })] },
      { ex: RUN, group: null, note: '', sets: [st({ km: 2, sec: 600, done: false })] },
    ],
  };
  const r = M.sessionExerciseStats(doc, s, RUN);
  assert.equal(r.km, 5.5);
  assert.equal(r.sec, 1600);
  assert.equal(r.pkm, 5);
  assert.equal(r.psec, 1500);
  assert.equal(r.maxKm, 5);
  assert.equal(M.sessionExerciseStats(doc, s, 'nope').km, 0);
});
