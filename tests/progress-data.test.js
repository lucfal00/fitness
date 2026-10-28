import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, addDays } from '../js/logic.js';
import {
  periodRange, shiftPeriod, bucketStats, cardioTotals, exerciseSeries, bodyEntries, movingAverage, weekGroupSets, trainedIn, sessionNames,
} from '../js/views/progress-data.js';

const noon = (date) => new Date(`${date}T12:00:00`).getTime();
const set = (o = {}) => ({ w: false, kg: null, reps: null, sec: null, km: null, rpe: null, done: true, ...o });
const sess = (date, items, o = {}) => ({
  id: `s_${date}`, date, start: noon(date), end: noon(date) + 3600000, tpl: null, rot: null, rpe: null, deleted: false, items, ...o,
});
const item = (ex, sets) => ({ ex, group: null, note: '', sets });

test('periodRange: calendar periods like Habits, complete axes', () => {
  const w = periodRange('settimana', '2026-10-28');
  assert.equal(w.from, '2026-10-26');
  assert.equal(w.to, '2026-11-01');                       // week across a month boundary
  assert.equal(w.buckets.length, 7);
  assert.deepEqual(w.buckets.map((b) => b.label), ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
  assert.equal(w.buckets[6].from, '2026-11-01');
  assert.equal(w.title, '26 ott – 1 nov');
  const m = periodRange('mese', '2026-10-28');
  assert.equal(m.buckets.length, 31);
  assert.equal(m.title, 'Ottobre 2026');
  assert.equal(periodRange('mese', '2028-02-10').buckets.length, 29);   // leap year
  assert.equal(periodRange('mese', '2028-02-10').to, '2028-02-29');
  assert.equal(periodRange('mese', '2027-02-10').buckets.length, 28);
  const h = periodRange('6mesi', '2026-02-15');          // across a year boundary
  assert.equal(h.from, '2025-09-01');
  assert.equal(h.to, '2026-02-28');
  assert.equal(h.title, 'Set – Feb 2026');
  assert.equal(h.buckets[0].from, '2025-09-01');
  assert.equal(h.buckets[h.buckets.length - 1].to, '2026-02-28');
  assert.ok(h.buckets.every((b, i, a) => i === 0 || b.from === addDays(a[i - 1].to, 1)));
  const y = periodRange('anno', '2026-10-28');
  assert.equal(y.buckets.length, 12);
  assert.equal(y.from, '2026-01-01');
  assert.equal(y.to, '2026-12-31');
  assert.equal(y.buckets[1].to, '2026-02-28');
  assert.equal(y.title, '2026');
  assert.equal(shiftPeriod('settimana', '2026-10-28', -1), '2026-10-21');
  assert.equal(shiftPeriod('6mesi', '2026-10-28', 1), '2027-04-01');
  assert.equal(shiftPeriod('anno', '2026-10-28', -1), '2025-10-01');
});

test('bucketStats: volume, groups, duration, RPE, cardio', () => {
  const d = emptyDoc();
  d.sessions = [
    sess('2026-10-27', [item('lib_panca_piana', [set({ kg: 60, reps: 8 }), set({ kg: 60, reps: 8, w: true })])], { rpe: 7 }),
    sess('2026-10-28', [item('lib_corsa', [set({ km: 5, sec: 1500 })])], { rpe: 8, end: noon('2026-10-28') + 1800000 }),
    sess('2026-10-28', [item('lib_squat', [set({ kg: 80, reps: 5 })])], { end: null, id: 's_open' }),
  ];
  const [b] = bucketStats(d, [{ from: '2026-10-26', to: '2026-11-01' }], '2026-10-28');
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

test('bucketStats: days after today stay empty', () => {
  const d = emptyDoc();
  d.sessions = [sess('2026-10-30', [item('lib_squat', [set({ kg: 80, reps: 5 })])])];
  assert.equal(bucketStats(d, [{ from: '2026-10-26', to: '2026-11-01' }], '2026-10-28')[0].n, 0);
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
