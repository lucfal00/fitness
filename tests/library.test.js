import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, KINDS, LIBRARY, resolveExercise, listExercises } from '../js/library.js';
import { emptyDoc } from '../js/logic.js';

test('library entries are well formed', () => {
  assert.ok(LIBRARY.length >= 90);
  assert.equal(GROUPS.length, 11);
  assert.equal(new Set(LIBRARY.map((e) => e.id)).size, LIBRARY.length);
  for (const e of LIBRARY) {
    assert.ok(e.id.startsWith('lib_'), e.id);
    assert.ok(e.name, e.id);
    assert.ok(KINDS.includes(e.kind), e.id);
    if (e.kind === 'cardio' || e.kind === 'sport') assert.equal(e.group, null, e.id);
    else assert.ok(GROUPS.includes(e.group), e.id);
    assert.ok(Array.isArray(e.also) && e.also.every((g) => GROUPS.includes(g)), e.id);
    if (e.kind === 'body') assert.ok(['reps', 'time'].includes(e.measure), e.id);
    else assert.ok(!('measure' in e), e.id);
  }
});

test('library covers the required exercises', () => {
  const names = LIBRARY.map((e) => e.name);
  for (const n of ['Panca piana con bilanciere', 'Squat con bilanciere', 'Trazioni alla sbarra', 'Plank', 'Corsa', 'Nuoto']) {
    assert.ok(names.includes(n), n);
  }
  assert.equal(LIBRARY.find((e) => e.name === 'Plank').measure, 'time');
});

test('resolveExercise applies edits and finds custom exercises', () => {
  const doc = emptyDoc();
  const lib = LIBRARY[0];
  assert.equal(resolveExercise(doc, lib.id).name, lib.name);
  doc.exerciseEdits[lib.id] = { name: 'Rinominato', hidden: true, t: 1 };
  const r = resolveExercise(doc, lib.id);
  assert.equal(r.name, 'Rinominato');
  assert.equal(r.hidden, true);
  assert.equal(r.group, lib.group);
  doc.exercises.push({ id: 'x_abc123', name: 'Mio', kind: 'weight', measure: 'reps', group: 'petto', also: [], deleted: true });
  assert.equal(resolveExercise(doc, 'x_abc123').name, 'Mio');
  assert.equal(resolveExercise(doc, 'nope'), null);
});

test('listExercises sorts, hides and drops deleted', () => {
  const doc = emptyDoc();
  const lib = LIBRARY[0];
  doc.exercises.push(
    { id: 'x_a', name: 'Aaa mio', kind: 'weight', group: 'petto', also: [], deleted: false },
    { id: 'x_b', name: 'Bbb mio', kind: 'weight', group: 'petto', also: [], deleted: true },
  );
  doc.exerciseEdits[lib.id] = { hidden: true, t: 1 };
  let list = listExercises(doc);
  assert.equal(list.length, LIBRARY.length);
  assert.ok(!list.some((e) => e.id === lib.id || e.id === 'x_b'));
  assert.ok(list.some((e) => e.id === 'x_a'));
  const names = list.map((e) => e.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'it')));
  list = listExercises(doc, { hidden: true });
  assert.ok(list.some((e) => e.id === lib.id));
  assert.ok(!list.some((e) => e.id === 'x_b'));
});
