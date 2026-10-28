import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '../js/logic.js';
import {
  periodRange, bucketStats, cardioTotals, exerciseSeries, bodyEntries, movingAverage, weekGroupSets, trainedIn, sessionNames,
} from '../js/views/progress-data.js';

const noon = (date) => new Date(`${date}T12:00:00`).getTime();
const set = (o = {}) => ({ w: false, kg: null, reps: null, sec: null, km: null, rpe: null, done: true, ...o });
const sess = (date, items, o = {}) => ({
  id: `s_${date}`, date, start: noon(date), end: noon(date) + 3600000, tpl: null, rot: null, rpe: null, deleted: false, items, ...o,
});
const item = (ex, sets) => ({ ex, group: null, note: '', sets });

test('periodRange: complete axes ending with the current week / month', () => {
  const w = periodRange('settimana', '2026-10-28');
  assert.equal(w.buckets.length, 12);
  assert.equal(w.buckets[11].from, '2026-10-26');
  assert.equal(w.buckets[11].to, '2026-11-01');
  assert.equal(w.buckets[0].from, '2026-08-10');
  assert.equal(periodRange('6mesi', '2026-10-28').buckets.length, 26);
  assert.equal(periodRange('anno', '2026-10-28').buckets.length, 52);
  const m = periodRange('mese', '2026-10-28');
  assert.equal(m.buckets.length, 12);
  assert.equal(m.buckets[11].from, '2026-10-01');
  assert.equal(m.buckets[11].to, '2026-10-31');
  assert.equal(m.buckets[0].from, '2025-11-01');
  assert.equal(m.buckets[0].to, '2025-11-30');
});

test('bucketStats: volume, groups, duration, RPE, cardio', () => {
  const d = emptyDoc();
  d.sessions = [
    sess('2026-10-27', [item('lib_panca_piana', [set({ kg: 60, reps: 8 }), set({ kg: 60, reps: 8, w: true })])], { rpe: 7 }),
    sess('2026-10-28', [item('lib_corsa', [set({ km: 5, sec: 1500 })])], { rpe: 8, end: noon('2026-10-28') + 1800000 }),
    sess('2026-10-28', [item('lib_squat', [set({ kg: 80, reps: 5 })])], { end: null, id: 's_open' }),
  ];
  const [b] = bucketStats(d, [{ from: '2026-10-26', to: '2026-11-01' }]);
  assert.equal(b.n, 2);
  assert.equal(b.volume, 480);
  assert.equal(b.groups.petto, 1);
  assert.equal(b.minutes, 45);
  assert.equal(b.rpe, 7.5);
  assert.deepEqual(b.cardio.lib_corsa, { km: 5, pkm: 5, psec: 1500 });
  assert.deepEqual(cardioTotals([b]), [{ id: 'lib_corsa', km: 5 }]);
  assert.equal(weekGroupSets(d, '2026-10-26').petto, 1);
  assert.deepEqual(sessionNames(d)['2026-10-27'], ['Allenamento libero']);
  assert.deepEqual(trainedIn(d, '2026-10-01', '2026-10-31').map((x) => x.id), ['lib_corsa', 'lib_panca_piana']);
});

test('exerciseSeries: e1RM, max load, volume per session, oldest first', () => {
  const d = emptyDoc();
  d.sessions = [
    sess('2026-10-20', [item('lib_panca_piana', [set({ kg: 60, reps: 10 }), set({ kg: 70, reps: 3 })])]),
    sess('2026-10-13', [item('lib_panca_piana', [set({ kg: 50, reps: 1 })])]),
  ];
  const s = exerciseSeries(d, 'lib_panca_piana');
  assert.deepEqual(s.map((x) => x.date), ['2026-10-13', '2026-10-20']);
  assert.equal(s[0].e1rm, 50);
  assert.equal(s[1].maxKg, 70);
  assert.equal(s[1].e1rm, 80);
  assert.equal(s[1].volume, 810);
  assert.equal(s[1].text, '60×10 · 70×3');
  assert.deepEqual(exerciseSeries(d, 'nope'), []);
});

test('body: empty entries dropped, 7-day moving average', () => {
  const d = emptyDoc();
  d.body = { '2026-10-20': { kg: 80, t: 1 }, '2026-10-22': { kg: 82, t: 1 }, '2026-10-30': { t: 1 }, '2026-10-31': { vita: 90, t: 1 } };
  const e = bodyEntries(d);
  assert.deepEqual(e.map((x) => x.date), ['2026-10-20', '2026-10-22', '2026-10-31']);
  const ma = movingAverage(e.filter((x) => x.kg != null));
  assert.deepEqual(ma.map((x) => x.value), [80, 81]);
});
