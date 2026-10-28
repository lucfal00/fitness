import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '../js/logic.js';
import { validateDoc, mergeDocs } from '../js/merge.js';

const item = (id, updatedAt, o = {}) => ({ id, name: id, updatedAt, ...o });

test('validateDoc accepts an empty doc', () => {
  assert.equal(validateDoc(emptyDoc()), true);
});

test('validateDoc rejects bad version, types and missing fields', () => {
  assert.equal(validateDoc({ ...emptyDoc(), version: 2 }), false);
  assert.equal(validateDoc({ ...emptyDoc(), sessions: {} }), false);
  assert.equal(validateDoc({ ...emptyDoc(), plan: [] }), false);
  assert.equal(validateDoc({ ...emptyDoc(), settings: null }), false);
  const d = emptyDoc();
  delete d.body;
  assert.equal(validateDoc(d), false);
  assert.equal(validateDoc(null), false);
  assert.equal(validateDoc('x'), false);
});

test('arrays: newest updatedAt wins per id, one-sided items kept, ties keep local', () => {
  for (const key of ['exercises', 'templates', 'programs', 'sessions']) {
    const a = emptyDoc();
    const b = emptyDoc();
    a[key] = [item('x', 1, { v: 'old' }), item('t', 5, { v: 'local' }), item('onlyL', 1)];
    b[key] = [item('x', 2, { v: 'new' }), item('t', 5, { v: 'incoming' }), item('onlyI', 1)];
    const { doc, count } = mergeDocs(a, b);
    const byId = Object.fromEntries(doc[key].map((o) => [o.id, o]));
    assert.equal(byId.x.v, 'new', key);
    assert.equal(byId.t.v, 'local', key);
    assert.ok(byId.onlyL && byId.onlyI, key);
    assert.equal(doc[key].length, 4, key);
    assert.equal(count, 2, key);
  }
});

test('keyed maps: newest t wins, including plan items:null overriding', () => {
  const a = emptyDoc();
  const b = emptyDoc();
  a.plan = { '2026-11-02': { items: ['A'], t: 1 }, '2026-11-03': { items: ['B'], t: 9 } };
  b.plan = { '2026-11-02': { items: null, t: 2 }, '2026-11-03': { items: ['C'], t: 3 }, '2026-11-04': { items: [], t: 1 } };
  a.exerciseEdits = { e1: { name: 'old', t: 1 } };
  b.exerciseEdits = { e1: { name: 'new', t: 2 }, e2: { name: 'z', t: 1 } };
  a.body = { '2026-11-02': { kg: 80, t: 5 } };
  b.body = { '2026-11-02': { kg: 79, t: 4 }, '2026-11-05': { kg: 78, t: 1 } };
  const { doc, count } = mergeDocs(a, b);
  assert.equal(doc.plan['2026-11-02'].items, null);
  assert.deepEqual(doc.plan['2026-11-03'].items, ['B']);
  assert.ok(doc.plan['2026-11-04']);
  assert.equal(doc.exerciseEdits.e1.name, 'new');
  assert.ok(doc.exerciseEdits.e2);
  assert.equal(doc.body['2026-11-02'].kg, 80);
  assert.equal(doc.body['2026-11-05'].kg, 78);
  assert.equal(count, 5);
});

test('settings: local kept, lastBackup is max', () => {
  const a = emptyDoc();
  const b = emptyDoc();
  a.settings = { ...a.settings, theme: 'dark', lastBackup: 10 };
  b.settings = { ...b.settings, theme: 'light', lastBackup: 20 };
  assert.deepEqual([mergeDocs(a, b).doc.settings.theme, mergeDocs(a, b).doc.settings.lastBackup], ['dark', 20]);
  b.settings.lastBackup = 5;
  assert.equal(mergeDocs(a, b).doc.settings.lastBackup, 10);
});

test('mergeDocs does not mutate inputs and returns a result validateDoc accepts', () => {
  const a = emptyDoc();
  const b = emptyDoc();
  a.exercises = [item('x', 1)];
  b.exercises = [item('x', 2), item('y', 1)];
  b.plan = { '2026-11-01': { items: null, t: 1 } };
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  const { doc, count } = mergeDocs(a, b);
  assert.equal(JSON.stringify(a), sa);
  assert.equal(JSON.stringify(b), sb);
  assert.equal(count, 3);
  assert.equal(validateDoc(doc), true);
  doc.exercises[0].name = 'mut';
  assert.equal(JSON.stringify(b), sb);
});

test('merging identical docs yields count 0', () => {
  const a = emptyDoc();
  a.sessions = [item('s', 3)];
  a.plan = { '2026-11-01': { items: ['A'], t: 3 } };
  assert.equal(mergeDocs(a, JSON.parse(JSON.stringify(a))).count, 0);
});

test('date-keyed maps: non-date keys (incl. __proto__) are dropped, valid keys kept', () => {
  const incoming = emptyDoc();
  incoming.body = JSON.parse('{"2026-10-28":{"kg":78,"t":1},"<img src=x onerror=alert(1)>":{"kg":1,"t":1},"__proto__":{"kg":9,"t":1},"constructor":{"kg":9,"t":1}}');
  incoming.plan = JSON.parse('{"2026-11-01":{"items":["a"],"t":1},"x\\"y":{"items":[],"t":1},"__proto__":{"items":["z"],"t":1}}');
  const { doc, count } = mergeDocs(emptyDoc(), incoming);
  assert.deepEqual(Object.keys(doc.body), ['2026-10-28']);
  assert.deepEqual(Object.keys(doc.plan), ['2026-11-01']);
  assert.equal(Object.getPrototypeOf(doc.body), Object.prototype);
  assert.equal(doc.body.kg, undefined);
  assert.equal(count, 2);
});

test('exerciseEdits: inherited names are not treated as existing keys', () => {
  const incoming = emptyDoc();
  incoming.exerciseEdits = JSON.parse('{"constructor":{"name":"x","t":0},"lib_a":{"name":"A","t":1}}');
  const { doc } = mergeDocs(emptyDoc(), incoming);
  assert.equal(Object.hasOwn(doc.exerciseEdits, 'lib_a'), true);
  assert.equal(Object.hasOwn(doc.exerciseEdits, 'constructor'), true);
  assert.deepEqual(doc.exerciseEdits.constructor, { name: 'x', t: 0 });
});
