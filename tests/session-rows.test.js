// Pure helpers of the live workout view: stepping, parsing, superset labels and rest, structure, rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '../js/logic.js';
import {
  stepValue, parseField, fmtField, fieldsFor, groupLabels, restAfter, structureChanged, setCounts,
  newSets, nextSet, warmIndex, prevSet, prevText, viewContext, rowHtml, cardHtml, fmtMinutes,
} from '../js/views/session-rows.js';

const set = (o = {}) => ({ w: false, kg: null, reps: null, sec: null, km: null, rpe: null, done: false, ...o });

test('stepValue: steps per field, floor 0, intensity 1-10, null stays on minus', () => {
  assert.equal(stepValue('kg', 100, 1, 2.5), 102.5);
  assert.equal(stepValue('kg', 1, -1, 2.5), 0);
  assert.equal(stepValue('reps', null, 1, 2.5), 1);
  assert.equal(stepValue('reps', null, -1, 2.5), null);
  assert.equal(stepValue('sec', 30, 1, 2.5), 35);
  assert.equal(stepValue('km', 5.2, 1, 2.5), 5.3);
  assert.equal(stepValue('dur', 1200, -1, 2.5), 1140);
  assert.equal(stepValue('int', 10, 1, 2.5), 10);
  assert.equal(stepValue('int', null, 1, 2.5), 1);
});

test('parseField: decimal comma, durations, empty and invalid', () => {
  assert.equal(parseField('kg', '102,5'), 102.5);
  assert.equal(parseField('kg', ''), null);
  assert.equal(parseField('kg', 'abc'), undefined);
  assert.equal(parseField('reps', '8'), 8);
  assert.equal(parseField('sec', '1:30'), 90);
  assert.equal(parseField('dur', '25'), 1500);
  assert.equal(parseField('dur', '25:30'), 1530);
  assert.equal(parseField('dur', '1:05:00'), 3900);
  assert.equal(parseField('dur', '1:5:0'), undefined);
  assert.equal(parseField('int', '12'), 10);
  assert.equal(fmtField('kg', 102.5), '102,5');
  assert.equal(fmtField('dur', 1530), '25:30');
  assert.equal(fmtField('reps', null), '');
});

test('fieldsFor: ballast column only when a body set carries kg', () => {
  assert.deepEqual(fieldsFor('weight', { sets: [set()] }), ['kg', 'reps']);
  assert.deepEqual(fieldsFor('reps', { sets: [set()] }), ['reps']);
  assert.deepEqual(fieldsFor('reps', { sets: [set(), set({ kg: 10 })] }), ['kg', 'reps']);
  assert.deepEqual(fieldsFor('time', { sets: [set()] }), ['sec']);
  assert.deepEqual(fieldsFor('cardio', { sets: [set()] }), ['km', 'dur']);
  assert.deepEqual(fieldsFor('sport', { sets: [set()] }), ['dur', 'int']);
});

test('groupLabels: only runs of 2+ consecutive items with the same group', () => {
  const items = [{ group: null }, { group: 'g1' }, { group: 'g1' }, { group: 'g2' }, { group: 'g3' }, { group: 'g3' }, { group: 'g3' }];
  assert.deepEqual(groupLabels(items), ['', 'A1', 'A2', '', 'B1', 'B2', 'B3']);
});

test('restAfter: item rest, default, superset after the last item of the round, none for cardio', () => {
  const doc = emptyDoc();
  const s = {
    items: [
      { ex: 'lib_panca_piana', group: null, rest: 120, sets: [set(), set()] },
      { ex: 'lib_croci_manubri', group: 'g1', sets: [set(), set(), set()] },
      { ex: 'lib_push_down', group: 'g1', rest: 60, sets: [set(), set()] },
      { ex: 'lib_corsa', group: null, sets: [set()] },
      { ex: 'lib_curl_manubri', group: null, sets: [set()] },
    ],
  };
  assert.equal(restAfter(doc, s, 0, 0), 120);
  assert.equal(restAfter(doc, s, 1, 0), 0);            // A1: wait for A2
  assert.equal(restAfter(doc, s, 2, 0), 60);           // A2 closes the round
  assert.equal(restAfter(doc, s, 1, 2), 60);           // round 3: A2 has no third set
  assert.equal(restAfter(doc, s, 3, 0), 0);            // cardio
  assert.equal(restAfter(doc, s, 4, 0), 90);           // settings default
});

test('structureChanged / setCounts', () => {
  const tpl = { items: [{ ex: 'a', sets: [{}, {}] }, { ex: 'b', sets: [{}] }] };
  const s = { items: [{ ex: 'a', sets: [set({ done: true }), set({ w: true, done: true })] }, { ex: 'b', sets: [set()] }] };
  assert.equal(structureChanged(tpl, s), false);
  assert.equal(structureChanged(null, s), false);
  s.items[1].sets.push(set());
  assert.equal(structureChanged(tpl, s), true);
  assert.deepEqual(setCounts(s), { done: 1, total: 3 });
});

test('newSets defaults per kind; nextSet copies the last working set; warm-ups go first', () => {
  const doc = emptyDoc();
  assert.equal(newSets(doc, 'lib_panca_piana').length, 3);
  assert.equal(newSets(doc, 'lib_panca_piana')[0].reps, 8);
  assert.equal(newSets(doc, 'lib_panca_piana', 5).length, 5);
  assert.equal(newSets(doc, 'lib_corsa').length, 1);
  const item = { sets: [set({ w: true, kg: 20, reps: 10 }), set({ kg: 60, reps: 8, tag: '+1 rip', done: true })] };
  const n = nextSet(item);
  assert.deepEqual([n.kg, n.reps, n.done, n.w, 'tag' in n], [60, 8, false, false, false]);
  assert.equal(nextSet(item, true).kg, 20);
  assert.equal(nextSet({ sets: [set({ kg: 60, reps: 8 })] }, true).kg, null);
  assert.equal(warmIndex(item), 1);
});

test('prevSet matches warm-ups and working sets by position; prevText per shape', () => {
  const prev = [set({ w: true, kg: 20, done: true }), set({ kg: 60, reps: 8, done: true }), set({ kg: 62.5, reps: 6, done: true }),
    set({ kg: 65, reps: 3 })];
  const sets = [set({ w: true }), set(), set(), set()];
  assert.equal(prevSet(prev, sets, 0).kg, 20);
  assert.equal(prevSet(prev, sets, 2).kg, 62.5);
  assert.equal(prevSet(prev, sets, 3), null);              // not done last time
  assert.equal(prevSet(null, sets, 0), null);
  assert.equal(prevText('weight', set({ kg: 62.5, reps: 6 })), '62,5 × 6');
  assert.equal(prevText('reps', set({ kg: 10, reps: 12 })), '+10 kg × 12 rip');
  assert.equal(prevText('time', set({ sec: 45 })), '45 s');
  assert.equal(prevText('cardio', set({ km: 5, sec: 1500 })), '5 km · 25:00');
  assert.equal(fmtMinutes(65 * 60000), '1 h 05 min');
});

test('rowHtml / cardHtml: steppers, tag, previous values, escaping, read-only', () => {
  const doc = emptyDoc();
  doc.exercises.push({ id: 'x_evil01', name: '<b>x</b>', kind: 'weight', group: 'petto', also: [], deleted: false, updatedAt: 1 });
  doc.sessions.push({
    id: 's_old', date: '2026-10-01', start: 1, end: 2, tpl: null, rot: null, rpe: null, note: '', deleted: false, updatedAt: 2,
    items: [{ ex: 'x_evil01', group: null, note: '', sets: [set({ kg: 100, reps: 8, done: true })] }],
  });
  const s = {
    id: 's_now', date: '2026-10-28', start: 10, end: null,
    items: [{ ex: 'x_evil01', group: null, note: '"n"', sets: [set({ kg: 102.5, reps: 6, tag: '+2,5 kg' })] }],
  };
  const c = viewContext(doc, s, false, new Set());
  const row = rowHtml(c, 0, 0);
  assert.match(row, /value="102,5"/);
  assert.match(row, /↑ \+2,5 kg/);
  assert.match(row, /100 × 8/);
  assert.equal((row.match(/data-act="(inc|dec)"/g) || []).length, 4);
  const card = cardHtml(c, 0, 'A1');
  assert.doesNotMatch(card, /<b>x<\/b>/);
  assert.match(card, /&quot;n&quot;/);
  assert.match(card, />A1</);
  const ro = rowHtml(viewContext(doc, s, true, new Set()), 0, 0);
  assert.equal((ro.match(/disabled/g) || []).length, 7);   // 4 step buttons, 2 inputs, check
});
