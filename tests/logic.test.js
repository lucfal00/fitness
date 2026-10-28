import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const tpl = (id, o = {}) => ({ id, name: id, items: [], archived: false, deleted: false, updatedAt: 1, ...o });
const prog = (o = {}) => ({
  id: 'P', name: 'P', kind: 'week', from: '2026-11-02', to: null, deleted: false, updatedAt: 1,
  weeks: [[['A'], [], ['B'], [], ['C', 'R'], [], []]], seq: [], days: null, ...o,
});
const noon = (date) => new Date(`${date}T12:00:00`).getTime();
const sess = (date, tplId, o = {}) => ({
  id: `s_${date}_${tplId}_${Math.random()}`, date, start: noon(date), end: noon(date) + 3600000,
  tpl: tplId, rot: null, deleted: false, items: [], ...o,
});

function docWith({ programs = [prog()], sessions = [], plan = {}, templates } = {}) {
  const d = L.emptyDoc();
  d.templates = templates ?? ['A', 'B', 'C', 'R', 'X', 'A2'].map((id) => tpl(id));
  d.programs = programs;
  d.sessions = sessions;
  d.plan = plan;
  return d;
}

const rotation = (o = {}) => prog({ kind: 'rotation', weeks: [], seq: ['A', 'B', 'C'], days: [1, 3, 5], ...o });

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
  assert.deepEqual(d.settings, { theme: 'auto', kgStep: 2.5, rest: 90, sound: true, lastBackup: 0 });
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

test('planned: week program', () => {
  const doc = docWith();
  assert.deepEqual(L.planned(doc, '2026-11-04', '2026-11-04'), { items: ['B'], count: 1 });
  assert.deepEqual(L.planned(doc, '2026-11-06', '2026-11-04').items, ['C', 'R']);
  assert.deepEqual(L.planned(doc, '2026-11-01', '2026-11-04'), { items: [], count: 0 });
});

test('planned: multi-week cycle', () => {
  const weeks = [[['A'], [], [], [], [], [], []], [['A2'], [], [], [], [], [], []]];
  const doc = docWith({ programs: [prog({ weeks })] });
  assert.deepEqual(L.planned(doc, '2026-11-09', '2026-11-02').items, ['A2']);
  assert.deepEqual(L.planned(doc, '2026-11-16', '2026-11-02').items, ['A']);
  const mid = docWith({ programs: [prog({ weeks, from: '2026-11-04' })] });
  assert.deepEqual(L.planned(mid, '2026-11-09', '2026-11-02').items, ['A2']);
  assert.deepEqual(L.planned(mid, '2026-11-16', '2026-11-02').items, ['A']);
});

test('planned: cycle across year change', () => {
  const weeks = [[['A'], [], [], [], [], [], []], [['A2'], [], [], [], [], [], []]];
  const doc = docWith({ programs: [prog({ weeks, from: '2026-12-28' })] });
  assert.deepEqual(L.planned(doc, '2027-01-04', '2026-12-28').items, ['A2']);
  assert.deepEqual(L.planned(doc, '2027-01-11', '2026-12-28').items, ['A']);
});

test('planned: plan overrides', () => {
  const at = (plan) => L.planned(docWith({ plan }), '2026-11-04', '2026-11-04');
  assert.deepEqual(at({ '2026-11-04': { items: [] } }), { items: [], count: 0 });
  assert.deepEqual(at({ '2026-11-04': { items: ['A', 'B'] } }).items, ['A', 'B']);
  assert.deepEqual(at({ '2026-11-04': { items: null } }).items, ['B']);
});

test('planned: archived or deleted templates are ignored', () => {
  for (const o of [{ archived: true }, { deleted: true }]) {
    const templates = [tpl('A'), tpl('B', o), tpl('C'), tpl('R')];
    assert.deepEqual(L.planned(docWith({ templates }), '2026-11-04', '2026-11-04').items, []);
  }
  assert.deepEqual(L.planned(docWith({ templates: [tpl('A')] }), '2026-11-04', '2026-11-04').items, []);
});

test('activeProgram', () => {
  const p1 = prog({ id: 'P1', from: '2026-10-01' });
  const p2 = prog({ id: 'P2', from: '2026-11-02' });
  const doc = docWith({ programs: [p1, p2] });
  assert.equal(L.activeProgram(doc, '2026-10-31').id, 'P1');
  assert.equal(L.activeProgram(doc, '2026-11-02').id, 'P2');
  assert.equal(L.activeProgram(doc, '2026-09-30'), null);
  assert.equal(L.activeProgram(docWith({ programs: [prog({ from: null })] }), '2026-11-02'), null);
  assert.equal(L.activeProgram(docWith({ programs: [prog({ to: '2026-11-05' })] }), '2026-11-06'), null);
  assert.equal(L.activeProgram(docWith({ programs: [prog({ deleted: true })] }), '2026-11-03'), null);
});

test('activationPatches', () => {
  const doc = docWith({
    programs: [prog({ id: 'P1', from: '2026-10-01' }), prog({ id: 'P2', from: null }),
      prog({ id: 'P3', from: '2026-12-01' })],
  });
  const patches = L.activationPatches(doc, 'P2', '2026-11-02');
  const by = Object.fromEntries(patches.map((p) => [p.id, p]));
  assert.equal(patches.length, 3);
  assert.deepEqual(by.P1, { id: 'P1', from: '2026-10-01', to: '2026-11-01' });
  assert.deepEqual(by.P3, { id: 'P3', from: null, to: null });
  assert.deepEqual(by.P2, { id: 'P2', from: '2026-11-02', to: null });
});

test('activationPatches leaves unrelated programs alone', () => {
  const doc = docWith({
    programs: [prog({ id: 'P1', from: '2026-10-01', to: '2026-10-20' }), prog({ id: 'P2', from: null })],
  });
  const patches = L.activationPatches(doc, 'P2', '2026-11-02', '2026-11-30');
  assert.deepEqual(patches, [{ id: 'P2', from: '2026-11-02', to: '2026-11-30' }]);
});

test('nextRotationIndex', () => {
  const p = rotation();
  const at = (sessions, program = p) => L.nextRotationIndex(docWith({ programs: [program], sessions }), program);
  assert.equal(at([]), 0);
  const s0 = sess('2026-11-02', 'A', { rot: { p: 'P', i: 0 } });
  assert.equal(at([s0]), 1);
  assert.equal(at([s0, sess('2026-11-03', 'C')]), 1);
  assert.equal(at([s0, sess('2026-11-04', 'B', { end: null, rot: { p: 'P', i: 1 } })]), 1);
  assert.equal(at([s0, sess('2026-11-04', 'B', { rot: { p: 'Q', i: 1 } })]), 1);
  assert.equal(at([sess('2026-11-02', 'C', { rot: { p: 'P', i: 2 } })]), 0);
  const q = rotation({ seq: ['A', 'B', 'A', 'C'] });
  assert.equal(at([sess('2026-11-02', 'A', { rot: { p: 'P', i: 2 } })], q), 3);
});

test('planned: rotation with days', () => {
  const p = rotation();
  const today = '2026-11-04';
  const doc = docWith({ programs: [p] });
  assert.deepEqual(L.planned(doc, '2026-11-04', today), { items: ['A'], count: 1 });
  assert.deepEqual(L.planned(doc, '2026-11-06', today).items, ['B']);
  assert.deepEqual(L.planned(doc, '2026-11-09', today).items, ['C']);
  assert.deepEqual(L.planned(doc, '2026-11-05', today), { items: [], count: 0 });
  assert.deepEqual(L.planned(doc, '2026-11-02', today), { items: [], count: 1 }); // past: count only
  assert.deepEqual(L.planned(doc, '2026-11-03', today).count, 0);

  const moved = docWith({ programs: [p], plan: { '2026-11-06': { items: ['X'] } } });
  assert.deepEqual(L.planned(moved, '2026-11-06', today).items, ['X']);
  assert.deepEqual(L.planned(moved, '2026-11-09', today).items, ['B']);

  const done = docWith({ programs: [p], sessions: [sess('2026-11-04', 'A', { rot: { p: 'P', i: 0 } })] });
  assert.deepEqual(L.planned(done, '2026-11-04', today), { items: ['A'], count: 1 });
  assert.deepEqual(L.planned(done, '2026-11-06', today).items, ['B']);
});

test('rotation with an archived template', () => {
  const p = rotation();
  const templates = ['A', 'B', 'C'].map((id) => tpl(id, { archived: id === 'B' }));
  const today = '2026-11-02';
  const doc = docWith({ programs: [p], templates });
  const seqAt = (dd) => ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09'].map((d) => L.planned(dd, d, today).items[0]);
  assert.deepEqual(seqAt(doc), ['A', 'C', 'A', 'C']);
  const afterA = docWith({ programs: [p], templates, sessions: [sess('2026-11-02', 'A', { rot: { p: 'P', i: 0 } })] });
  assert.equal(L.nextRotationIndex(afterA, p), 2);
  const afterC = docWith({ programs: [p], templates, sessions: [sess('2026-11-02', 'C', { rot: { p: 'P', i: 2 } })] });
  assert.equal(L.nextRotationIndex(afterC, p), 0);
  const none = docWith({ programs: [p], templates: ['A', 'B', 'C'].map((id) => tpl(id, { archived: true })) });
  for (const d of ['2026-11-04', '2026-11-06', '2026-11-09']) assert.deepEqual(L.planned(none, d, today), { items: [], count: 0 }, d);
  assert.deepEqual(L.planned(none, '2026-10-30', today), { items: [], count: 0 });   // past training day: nothing was plannable
  const noneDone = docWith({ programs: [p], templates: ['A', 'B', 'C'].map((id) => tpl(id, { archived: true })), sessions: [sess('2026-11-04', 'A', { rot: { p: 'P', i: 0 } })] });
  assert.deepEqual(L.planned(noneDone, today, today), { items: [], count: 0 });
  assert.equal(L.nextRotationIndex(none, p), 0);
});

test('planned: rotation uses the latest session by start', () => {
  const p = rotation();
  const today = '2026-11-04';
  const sessions = [
    sess('2026-11-04', 'B', { start: noon('2026-11-04') + 7200000, rot: { p: 'P', i: 1 } }),
    sess('2026-11-04', 'A', { rot: { p: 'P', i: 0 } }),
  ];
  const doc = docWith({ programs: [p], sessions });
  assert.deepEqual(L.planned(doc, today, today).items, ['B']);
  assert.deepEqual(L.planned(doc, '2026-11-06', today).items, ['C']);
});

test('planned: rotation without days and free program', () => {
  for (const p of [rotation({ days: null }), prog({ kind: 'free', weeks: [] })]) {
    const doc = docWith({ programs: [p] });
    for (const d of ['2026-11-02', '2026-11-04', '2026-11-09']) {
      assert.equal(L.planned(doc, d, '2026-11-04').count, 0);
    }
  }
});

test('isPlannedDone', () => {
  const doc = docWith({ sessions: [sess('2026-11-04', 'B'), sess('2026-11-06', 'C', { end: null })] });
  assert.equal(L.isPlannedDone(doc, '2026-11-04', 'B'), true);
  assert.equal(L.isPlannedDone(doc, '2026-11-04', 'A'), false);
  assert.equal(L.isPlannedDone(doc, '2026-11-06', 'C'), false);
});

test('adherence', () => {
  const sessions = [sess('2026-11-02', 'A'), sess('2026-11-06', 'C'), sess('2026-11-07', 'A')];
  // week program here: A Mon, B Wed, C Fri (R removed)
  const p = prog({ weeks: [[['A'], [], ['B'], [], ['C'], [], []]] });
  const doc = docWith({ programs: [p], sessions });
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-08', '2026-11-08'), 2 / 3);
  const skipped = docWith({ programs: [p], sessions, plan: { '2026-11-04': { items: [] } } });
  assert.equal(L.adherence(skipped, '2026-11-02', '2026-11-08', '2026-11-08'), 1);
  const early = docWith({ programs: [p], sessions: [sess('2026-11-02', 'A')] });
  assert.equal(L.adherence(early, '2026-11-02', '2026-11-08', '2026-11-04'), 1); // today not missed
  assert.equal(L.adherence(docWith({ programs: [] }), '2026-11-02', '2026-11-08', '2026-11-08'), null);
});

test('adherence: rotation with days', () => {
  const p = rotation();
  const doc = docWith({ programs: [p], sessions: [sess('2026-11-02', 'A', { rot: { p: 'P', i: 0 } })] });
  // Mon done, Wed and Fri missed
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-08', '2026-11-08'), 1 / 3);
});

// one full week of P starting Monday `mon`: A, B, C, R
const fullWeek = (mon) => [
  sess(mon, 'A'), sess(L.addDays(mon, 2), 'B'), sess(L.addDays(mon, 4), 'C'), sess(L.addDays(mon, 4), 'R'),
];

test('weekStreaks: week program', () => {
  const sessions = [...fullWeek('2026-11-02'), ...fullWeek('2026-11-09'), ...fullWeek('2026-11-23')];
  const doc = docWith({ sessions });
  assert.deepEqual(L.weekStreaks(doc, '2026-12-02'), { current: 1, best: 2 });
});

test('weekStreaks: weeks with everything skipped are ignored', () => {
  const plan = {};
  for (let i = 0; i < 7; i++) plan[L.addDays('2026-11-09', i)] = { items: [] };
  const sessions = [...fullWeek('2026-11-02'), ...fullWeek('2026-11-16')];
  const doc = docWith({ sessions, plan });
  assert.deepEqual(L.weekStreaks(doc, '2026-11-25'), { current: 2, best: 2 });
});

test('weekStreaks: free program counts weeks with a session', () => {
  const p = prog({ kind: 'free', weeks: [] });
  const sessions = [sess('2026-11-03', 'A'), sess('2026-11-12', 'B'), sess('2026-11-26', 'C')];
  const doc = docWith({ programs: [p], sessions });
  assert.deepEqual(L.weekStreaks(doc, '2026-12-02'), { current: 1, best: 2 });
  assert.deepEqual(L.weekStreaks(docWith({ programs: [], sessions: [] }), '2026-12-02'), { current: 0, best: 0 });
});

test('weekStreaks: rotation with days', () => {
  const p = rotation();
  const rs = (mon) => ['A', 'B', 'C'].map((id, i) => sess(L.addDays(mon, 2 * i), id, { rot: { p: 'P', i } }));
  const sessions = [...rs('2026-11-02'), ...rs('2026-11-09'), sess('2026-11-16', 'A', { rot: { p: 'P', i: 0 } }), ...rs('2026-11-23')];
  const doc = docWith({ programs: [p], sessions });
  assert.deepEqual(L.weekStreaks(doc, '2026-11-29'), { current: 1, best: 2 });
});

// ---- Schede: weekly target (rotation without preferred days) -------------

const scheda = (o = {}) => rotation({
  id: 'S', name: 'Push', perWeek: 3, days: null, seq: ['A', 'B', 'C'], from: '2026-11-02', emoji: '💪', color: '#2f8f4a', ...o,
});
// n sessions on the Mon, Tue, Thu... of the week starting `mon`
const inWeek = (mon, n) => Array.from({ length: n }, (_, i) => sess(L.addDays(mon, [0, 1, 3, 4, 5, 6][i]), 'A'));

test('weekProgress', () => {
  const p = scheda();
  const today = '2026-11-04';
  assert.deepEqual(L.weekProgress(docWith({ programs: [p] }), today), { done: 0, target: 3 });
  const two = docWith({ programs: [p], sessions: [...inWeek('2026-11-02', 2), sess('2026-10-30', 'B')] });
  assert.deepEqual(L.weekProgress(two, today), { done: 2, target: 3 });
  const over = docWith({ programs: [p], sessions: inWeek('2026-11-02', 4) });
  assert.deepEqual(L.weekProgress(over, '2026-11-08'), { done: 4, target: 3 });
  const open = docWith({ programs: [p], sessions: [sess('2026-11-02', 'A', { end: null }), sess('2026-11-03', 'A', { deleted: true })] });
  assert.equal(L.weekProgress(open, today).done, 0);
  const none = docWith({ programs: [], sessions: [sess('2026-11-03', 'A')] });
  assert.deepEqual(L.weekProgress(none, today), { done: 1, target: null });
  assert.equal(L.weekProgress(docWith({ programs: [p] }), '2026-10-28').target, null);   // before activation
  assert.equal(L.weekProgress(docWith(), today).target, null);                              // week program: no weekly target
});

test('adherence: scheda without days is scored per week', () => {
  const p = scheda();
  const sessions = [...inWeek('2026-11-02', 3), ...inWeek('2026-11-09', 2), ...inWeek('2026-11-16', 1)];
  const doc = docWith({ programs: [p], sessions });
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-22', '2026-11-23'), 6 / 9);
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-22', '2026-11-25'), 6 / 9);
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-22', '2026-11-22'), 6 / 7);   // Sunday: week 3 is still the running one
  // running week is never missed: 1 session on Wed of the third week
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-22', '2026-11-18'), 6 / 7);
  const first = docWith({ programs: [p], sessions: inWeek('2026-11-02', 1) });
  assert.equal(L.adherence(first, '2026-11-02', '2026-11-08', '2026-11-04'), 1);
  assert.equal(L.adherence(first, '2026-11-02', '2026-11-08', '2026-11-09'), 1 / 3);
  // more sessions than the target do not exceed it
  const over = docWith({ programs: [p], sessions: inWeek('2026-11-02', 5) });
  assert.equal(L.adherence(over, '2026-11-02', '2026-11-08', '2026-11-08'), 1);
});

test('adherence: weeks before the activation are excluded; activation mid-week owns that week', () => {
  const later = scheda({ from: '2026-11-09' });
  const doc = docWith({ programs: [later], sessions: [...inWeek('2026-10-26', 3), ...inWeek('2026-11-09', 2)] });
  assert.equal(L.adherence(doc, '2026-10-26', '2026-11-15', '2026-11-16'), 2 / 3);
  assert.equal(L.adherence(doc, '2026-10-26', '2026-11-08', '2026-11-15'), null);
  const mid = docWith({ programs: [scheda({ from: '2026-11-04' })], sessions: [sess('2026-11-05', 'A')] });
  assert.equal(L.adherence(mid, '2026-11-02', '2026-11-08', '2026-11-09'), 1 / 3);
});

test('adherence: scheda change mid-period sums the contributions of each', () => {
  const p1 = scheda({ id: 'P1', perWeek: 2, to: '2026-11-15' });
  const p2 = scheda({ id: 'P2', perWeek: 3, from: '2026-11-16' });
  const sessions = [...inWeek('2026-11-02', 2), ...inWeek('2026-11-09', 1), ...inWeek('2026-11-16', 3)];
  const doc = docWith({ programs: [p1, p2], sessions });
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-22', '2026-11-23'), 6 / 7);
  // days-based program followed by a scheda without days: per-day then per-week
  const wk = prog({ id: 'W', from: '2026-11-02', to: '2026-11-08', weeks: [[['A'], [], [], [], [], [], []]] });
  const mix = docWith({ programs: [wk, scheda({ id: 'S2', from: '2026-11-09' })], sessions: [...inWeek('2026-11-09', 1)] });
  assert.equal(L.adherence(mix, '2026-11-02', '2026-11-15', '2026-11-16'), 1 / 4);
});

test('weekStreaks: scheda without days, week complete when done >= perWeek', () => {
  const p = scheda({ perWeek: 2 });
  const sessions = [
    ...inWeek('2026-11-02', 2), ...inWeek('2026-11-09', 1), ...inWeek('2026-11-16', 2), ...inWeek('2026-11-23', 3), ...inWeek('2026-11-30', 1),
  ];
  const doc = docWith({ programs: [p], sessions });
  // c x c c, current week incomplete -> ignored
  assert.deepEqual(L.weekStreaks(doc, '2026-12-02'), { current: 2, best: 2 });
  // current week complete -> counted
  const done = docWith({ programs: [p], sessions: [...sessions, sess('2026-12-01', 'B')] });
  assert.deepEqual(L.weekStreaks(done, '2026-12-02'), { current: 3, best: 3 });
  // a past incomplete week breaks the streak
  const broken = docWith({ programs: [p], sessions: [...inWeek('2026-11-02', 2), ...inWeek('2026-11-09', 1)] });
  assert.deepEqual(L.weekStreaks(broken, '2026-11-18'), { current: 0, best: 1 });
});

test('rotation: a skipped day does not consume a position', () => {
  const p = scheda({ perWeek: 3 });
  const g1 = sess('2026-11-02', 'A', { rot: { p: 'S', i: 0 } });
  const doc = docWith({ programs: [p], sessions: [g1] });
  assert.equal(L.nextRotationIndex(doc, p), 1);
  assert.deepEqual(L.planned(doc, '2026-11-05', '2026-11-05'), { items: [], count: 0 });   // no per-date plan without days
  const free = docWith({ programs: [p], sessions: [g1, sess('2026-11-05', 'C')] });         // day 2 skipped for a free workout
  assert.equal(L.nextRotationIndex(free, p), 1);                                              // still day 2
  const g2 = sess('2026-11-06', 'B', { rot: { p: 'S', i: 1 } });
  assert.equal(L.nextRotationIndex(docWith({ programs: [p], sessions: [g1, g2] }), p), 2);
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

test('nextRotationIndex follows the last day by template, not by stale position', () => {
  const afterB = (seq) => {
    const p = scheda({ seq });
    return { p, doc: docWith({ programs: [p], sessions: [sess('2026-11-04', 'B', { rot: { p: 'S', i: 1 } })] }) };
  };
  let { p, doc } = afterB(['A', 'B', 'C']);
  assert.equal(L.nextRotationIndex(doc, p), 2);
  ({ p, doc } = afterB(['A', 'A2', 'B', 'C']));                 // A duplicated before B: B moved to 2
  assert.equal(L.nextRotationIndex(doc, p), 3);
  ({ p, doc } = afterB(['B', 'A', 'C']));                       // days moved: B is first
  assert.equal(L.nextRotationIndex(doc, p), 1);
  ({ p, doc } = afterB(['B', 'C']));                            // earlier day deleted
  assert.equal(L.nextRotationIndex(doc, p), 1);
  ({ p, doc } = afterB(['A', 'B', 'C', 'B']));                  // twice: rot.i holds B
  assert.equal(L.nextRotationIndex(doc, p), 2);
  ({ p, doc } = afterB(['B', 'C', 'A', 'B']));                  // twice, rot.i no longer B: first occurrence
  assert.equal(L.nextRotationIndex(doc, p), 1);
  ({ p, doc } = afterB(['A', 'C']));                            // B left the rotation: recorded position
  assert.equal(L.nextRotationIndex(doc, p), 0);
  // planned today after the session follows the same position
  const q = scheda({ seq: ['A', 'A2', 'B', 'C'], days: [1, 2, 3, 4, 5, 6, 7] });
  const d2 = docWith({ programs: [q], sessions: [sess('2026-11-04', 'B', { rot: { p: 'S', i: 1 } })] });
  assert.deepEqual(L.planned(d2, '2026-11-04', '2026-11-04').items, ['B']);
  assert.deepEqual(L.planned(d2, '2026-11-05', '2026-11-04').items, ['C']);
});

test('adherence: weekly sessions are clamped to the range and to the activation', () => {
  const p = scheda({ from: '2026-11-04' });
  const doc = docWith({ programs: [p], sessions: [sess('2026-11-02', 'A'), sess('2026-11-05', 'A'), sess('2026-11-07', 'A')] });
  // activation on Wed: the Monday session is not counted
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-08', '2026-11-09'), 2 / 3);
  // range Fri..Sun: only the Saturday session
  assert.equal(L.adherence(doc, '2026-11-06', '2026-11-08', '2026-11-09'), 1 / 3);
  // range ends before the later sessions
  assert.equal(L.adherence(doc, '2026-11-02', '2026-11-05', '2026-11-09'), 1 / 3);
  // sessions after today are not counted (data in the future)
  const future = docWith({ programs: [p], sessions: [sess('2026-11-05', 'A'), sess('2026-11-07', 'A')] });
  assert.equal(L.adherence(future, '2026-11-02', '2026-11-08', '2026-11-06'), 1);
  // range entirely in the future
  assert.equal(L.adherence(future, '2026-11-16', '2026-11-22', '2026-11-10'), null);
  assert.equal(L.adherence(future, '2026-11-07', '2026-11-08', '2026-11-06'), null);
});
