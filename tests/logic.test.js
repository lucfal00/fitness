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
  assert.deepEqual(L.planned(none, '2026-11-04', today), { items: [], count: 1 });
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
