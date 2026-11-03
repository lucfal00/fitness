import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const tpl = (id, o = {}) => ({ id, name: id, items: [{ ex: 'x', sets: [{ reps: [8, 8] }] }], archived: false, deleted: false, updatedAt: 1, ...o });
const scheda = (o = {}) => ({
  id: 'S', name: 'Push', kind: 'rotation', seq: ['A', 'B', 'C'], from: '2026-11-02', to: null, emoji: '💪', color: '#2f8f4a',
  weeks: [], deleted: false, updatedAt: 1, ...o,
});
const noon = (date) => new Date(`${date}T12:00:00`).getTime();
const sess = (date, tplId, o = {}) => ({
  id: `s_${date}_${tplId}_${Math.random()}`, date, start: noon(date), end: noon(date) + 3600000,
  tpl: tplId, rot: null, deleted: false, items: [], ...o,
});

function docWith({ programs = [scheda()], sessions = [], plan = {}, templates } = {}) {
  const d = L.emptyDoc();
  d.templates = templates ?? ['A', 'B', 'C', 'R', 'X', 'A2'].map((id) => tpl(id));
  d.programs = programs;
  d.sessions = sessions;
  d.plan = plan;
  return d;
}


test('date helpers', () => {
  assert.equal(L.toKey(new Date(2026, 9, 27)), '2026-10-27');
  assert.equal(L.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(L.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(L.addDays('2026-10-24', 2), '2026-10-26'); // DST change 25/10
  assert.equal(L.weekday('2026-10-27'), 2);
  assert.equal(L.weekday('2026-11-01'), 7);
  assert.equal(L.weekStart('2026-11-01'), '2026-10-26');
  assert.equal(L.monthStart('2026-11-15'), '2026-11-01');
  assert.equal(L.monthEnd('2026-02-10'), '2026-02-28');
  assert.equal(L.addMonths('2026-11-15', 2), '2027-01-01');
  assert.equal(L.todayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(L.fromKey('2026-11-02').getDate(), 2);
});

test('diffDays', () => {
  assert.equal(L.diffDays('2026-12-28', '2027-01-04'), 7);
  assert.equal(L.diffDays('2026-10-24', '2026-10-26'), 2); // DST
  assert.equal(L.diffDays('2026-11-05', '2026-11-02'), -3);
});

test('newId and emptyDoc', () => {
  assert.match(L.newId('t_'), /^t_[0-9a-z]{6}$/);
  assert.notEqual(L.newId('t_'), L.newId('t_'));
  const d = L.emptyDoc();
  assert.equal(d.version, 1);
  assert.deepEqual(d.settings, { theme: 'auto', kgStep: 2.5, rest: 90, sound: true, loud: true, lastBackup: 0 });
  assert.deepEqual(d.plan, {});
  assert.deepEqual(d.sessions, []);
});

test('isConcluded and doneCount', () => {
  const doc = docWith({
    sessions: [sess('2026-11-04', 'A'), sess('2026-11-04', 'B', { end: null }),
      sess('2026-11-04', 'C', { deleted: true }), sess('2026-11-05', 'A')],
  });
  assert.equal(L.isConcluded(doc.sessions[0]), true);
  assert.equal(L.isConcluded(doc.sessions[1]), false);
  assert.equal(L.isConcluded(doc.sessions[2]), false);
  assert.equal(L.doneCount(doc, '2026-11-04'), 1);
  assert.equal(L.doneCount(doc, '2026-11-06'), 0);
});

test('isScheda, isDate, isRunning, schedaGroups and choosableDays', () => {
  assert.equal(L.isScheda(scheda()), true);
  assert.equal(L.isScheda(scheda({ deleted: true })), false);
  assert.equal(L.isScheda({ ...scheda(), kind: 'week' }), false);                             // legacy week program
  assert.equal(L.isScheda(null), false);
  assert.equal(L.isDate('2026-02-28'), true);
  assert.equal(L.isDate('2026-02-30'), false);
  assert.equal(L.isDate('26-1-1'), false);
  assert.equal(L.isRunning(scheda({ from: '2026-11-02', to: '2026-11-10' }), '2026-11-10'), true);
  assert.equal(L.isRunning(scheda({ from: '2026-11-02', to: '2026-11-10' }), '2026-11-11'), false);
  assert.equal(L.isRunning(scheda({ from: '2026-11-02' }), '2026-11-01'), false);
  assert.equal(L.isRunning(scheda({ from: null }), '2026-11-01'), false);
  const today = '2026-11-10';
  const live = scheda({ id: 'S', name: 'Live', seq: ['A', 'B'], from: '2026-11-01', to: null });
  const both = scheda({ id: 'T', name: 'Also', seq: ['R'], from: '2026-11-05', to: '2026-11-30' });   // two at once
  const old = scheda({ id: 'O', name: 'Old', seq: ['C'], from: '2026-09-01', to: '2026-10-01' });
  const later = scheda({ id: 'I', name: 'Later', seq: ['A2'], from: '2026-12-01', to: null });
  const templates = [
    tpl('A', { scheda: 'S', order: 1 }), tpl('B', { scheda: 'S', order: 2, archived: true }), tpl('C', { scheda: 'O', order: 3 }),
    tpl('A2', { scheda: 'I', order: 4 }), tpl('R', { scheda: 'T', order: 6 }), tpl('X', { order: 5 }), tpl('Y', { order: 0 }),
  ];
  const doc = docWith({ programs: [live, old, later, both], templates });
  const g = L.schedaGroups(doc, today);
  assert.deepEqual([g.running.map((p) => p.id), g.upcoming.map((p) => p.id), g.concluded.map((p) => p.id)], [['T', 'S'], ['I'], ['O']]);
  const ids = (list) => list.map((t) => t.id);
  const c = L.choosableDays(doc, today);
  assert.deepEqual(c.groups.map((x) => [x.p.id, ids(x.days)]), [['T', ['R']], ['S', ['A']], ['I', ['A2']]]);   // archived out, concluded out
  assert.deepEqual(ids(c.loose), ['Y', 'X']);
  assert.deepEqual(ids(L.choosableList(doc, today, { withConcluded: true })), ['R', 'A', 'A2', 'C', 'Y', 'X']);
  doc.templates.find((t) => t.id === 'R').items = [];                                         // a day without exercises is not choosable
  assert.deepEqual(L.choosableDays(doc, today).groups[0].days, []);
});

test('lastSessionOf and lastDayOf: only the same day / scheda, latest by start', () => {
  const sessions = [
    sess('2026-11-03', 'A'), sess('2026-11-05', 'B'), sess('2026-11-04', 'A', { start: noon('2026-11-06') }),
    sess('2026-11-08', 'X'), sess('2026-11-09', 'B', { end: null }), sess('2026-11-09', 'C', { deleted: true }),
  ];
  const doc = docWith({ sessions });
  assert.equal(L.lastSessionOf(doc, 'A'), sessions[2]);
  assert.equal(L.lastSessionOf(doc, 'A', sessions[2].id), sessions[0]);
  assert.equal(L.lastSessionOf(doc, 'B'), sessions[1]);                                       // the open one does not count
  assert.equal(L.lastSessionOf(doc, 'C'), null);
  assert.equal(L.lastDayOf(doc, doc.programs[0]), 'A');                                        // X is not in the scheda
  assert.equal(L.lastDayOf(doc, scheda({ seq: ['R'] })), null);
});

test('weekStreaks: weeks in a row with at least one workout', () => {
  const doc = (dates) => docWith({ sessions: dates.map((d) => sess(d, 'A')) });
  assert.deepEqual(L.weekStreaks(doc([]), '2026-11-18'), { current: 0, best: 0 });
  // weeks of 26/10, 2/11, (9/11 empty), 16/11 (current)
  assert.deepEqual(L.weekStreaks(doc(['2026-10-27', '2026-11-03', '2026-11-04', '2026-11-17']), '2026-11-18'), { current: 1, best: 2 });
  // current week still empty: the streak up to last week stays
  assert.deepEqual(L.weekStreaks(doc(['2026-11-03', '2026-11-10']), '2026-11-17'), { current: 2, best: 2 });
  assert.deepEqual(L.weekStreaks(doc(['2026-11-03']), '2026-11-17'), { current: 0, best: 1 });
  assert.deepEqual(L.weekStreaks(doc(['2026-11-30']), '2026-11-17'), { current: 0, best: 0 });   // future sessions ignored
});

test('schedaOf and workoutLabel', () => {
  const p = scheda({ name: 'Forza' });
  const templates = [tpl('A', { scheda: 'S', dayName: 'Petto', name: 'Forza · Petto' }), tpl('X', { name: 'Libero sciolto' })];
  const doc = docWith({ programs: [p], templates });
  assert.equal(L.schedaOf(doc, 'A'), p);
  assert.equal(L.schedaOf(doc, 'X'), null);
  assert.equal(L.schedaOf(doc, 'nope'), null);
  assert.equal(L.schedaOf(doc, null), null);
  assert.equal(L.workoutLabel(doc, 'A'), 'Forza · Petto');
  assert.equal(L.workoutLabel(doc, 'X'), 'Libero sciolto');
  assert.equal(L.workoutLabel(doc, null), 'Allenamento libero');
  assert.equal(L.workoutLabel(doc, 'nope'), 'Allenamento libero');
  p.deleted = true;                                                                           // history keeps the name
  assert.equal(L.workoutLabel(doc, 'A'), 'Forza · Petto');
});
