// Pure output checks for ui helpers, stackedBars and bodyMap; store smoke test with a fake localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtKg, fmtDuration, esc, safeColor } from '../js/ui.js';
import { stackedBars } from '../js/charts.js';
import { bodyMap } from '../js/bodymap.js';
import { GROUPS } from '../js/library.js';
import { todayKey, addDays } from '../js/logic.js';

test('ui formatting', () => {
  assert.equal(fmtKg(62.5), '62,5');
  assert.equal(fmtKg(60), '60');
  assert.equal(fmtDuration(65), '1:05');
  assert.equal(fmtDuration(3725), '1:02:05');
  assert.equal(esc('<a "b">'), '&lt;a &quot;b&quot;&gt;');
  assert.equal(safeColor('red'), '#16a34a');
});

test('stackedBars: one hit area per series, segments only for non-zero values', () => {
  const svg = stackedBars(
    [{ label: '1/1', values: { petto: 6, dorso: 4 } }, { label: '8/1', values: { petto: 3 } }],
    ['petto', 'dorso'], ['#111111', '#222222'],
  );
  assert.equal((svg.match(/class="hit"/g) || []).length, 2);
  assert.equal((svg.match(/fill:#111111/g) || []).length, 2);
  assert.equal((svg.match(/fill:#222222/g) || []).length, 1);
  assert.match(stackedBars([], ['a'], ['#000000']), /<svg/);
});

test('bodyMap: every group present with level styling', () => {
  const svg = bodyMap({ petto: 4, dorso: 0 });
  for (const g of GROUPS) assert.match(svg, new RegExp(`data-group="${g}"`));
  assert.match(svg, /data-group="petto" data-level="4" style="fill:var\(--accent\);fill-opacity:1"/);
  assert.match(svg, /data-group="dorso" data-level="0" style="fill:var\(--track\)"/);
});

test('store: mutations, session lifecycle, import failure', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const s = await import('../js/store.js');
  s.load();
  const events = [];
  s.onChange((e) => events.push(e.detail.kind));
  const sets = [{ reps: [8, 10], kg: 60 }, { reps: [8, 10], kg: 60 }];
  const tid = s.saveTemplate({ name: 'Push', items: [{ ex: 'lib_panca_piana', rest: 90, sets }] });
  const sid = s.startSession({ tpl: tid });
  assert.equal(s.openSessionId(), sid);
  assert.equal(s.getDoc().sessions[0].items[0].sets.length, 2);
  s.updateSession(sid, (x) => {
    x.items[0].sets[0].done = true;
    x.items[0].sets.push({ w: false, kg: 70, reps: 5, sec: null, km: null, rpe: null, done: true });
  });
  s.finishSession(sid, { rpe: 7, updateTemplate: true });
  assert.equal(s.openSessionId(), null);
  const tpl = s.getDoc().templates[0];
  assert.equal(tpl.items[0].sets.length, 3);
  assert.deepEqual(tpl.items[0].sets[0].reps, [8, 10]);
  assert.deepEqual(tpl.items[0].sets[2], { reps: [5, 5], kg: 70 });
  const pid = s.addPastSession({ date: '2026-10-01', tpl: tid, minutes: 45 });
  const past = s.getDoc().sessions.find((x) => x.id === pid);
  assert.equal(past.end - past.start, 45 * 60000);
  assert.ok(past.items[0].sets.every((x) => x.done));
  s.setBody('2026-10-28', { kg: 78.4, vita: 84 });
  s.setBody('2026-10-28', { vita: null });
  assert.equal(s.getDoc().body['2026-10-28'].vita, undefined);
  s.setPlan('2026-11-01', [tid]);
  s.movePlanned('2026-11-01', '2026-11-02', tid);
  assert.deepEqual(s.getDoc().plan['2026-11-01'].items, []);
  assert.deepEqual(s.getDoc().plan['2026-11-02'].items, [tid]);
  const before = JSON.stringify(s.getDoc());
  await assert.rejects(s.importBackup({ text: async () => '{"version":1}' }), /Backup non valido/);
  await assert.rejects(s.importBackup({ text: async () => 'nope' }), /Backup non valido/);
  assert.equal(JSON.stringify(s.getDoc()), before);
  assert.ok(events.includes('session') && events.includes('plan'));
  assert.equal(JSON.parse(mem.get('fitness.v1')).templates.length, 1);
});

// Fresh store module per call (cache-busting query) with a controllable fake localStorage.
let fresh = 0;
async function freshStore(ls) {
  globalThis.localStorage = ls;
  const s = await import(`../js/store.js?case=${++fresh}`);
  s.load();
  return s;
}
const memStorage = (mem = new Map(), { failSet = false } = {}) => ({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (failSet) throw new Error('quota'); mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
});

test('store: unavailable storage -> read-only with notice, mutations are no-ops', async () => {
  const s = await freshStore({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.equal(s.isReadOnly(), true);
  assert.match(s.getNotice(), /Memoria del browser non disponibile/);
  assert.equal(s.saveTemplate({ name: 'X' }), null);
  assert.equal(s.getDoc().templates.length, 0);
  s.clearNotice();
  assert.notEqual(s.getNotice(), '');
});

test('store: corrupt JSON is kept under .corrupt and the doc restarts empty', async () => {
  const mem = new Map([['fitness.v1', '{not json']]);
  const s = await freshStore(memStorage(mem));
  assert.equal(mem.get('fitness.v1.corrupt'), '{not json');
  assert.equal(s.getDoc().templates.length, 0);
  assert.match(s.getNotice(), /danneggiati/);
  assert.equal(s.isReadOnly(), false);
});

test('store: corrupt JSON and the .corrupt copy cannot be written -> read-only, original never overwritten', async () => {
  const mem = new Map([['fitness.v1', '{not json']]);
  const s = await freshStore(memStorage(mem, { failSet: true }));
  assert.equal(s.isReadOnly(), true);
  assert.match(s.getNotice(), /non sono riuscito a conservarne una copia/);
  s.saveTemplate({ name: 'X' });
  s.clearNotice();
  assert.match(s.getNotice(), /danneggiati/);
  assert.equal(mem.get('fitness.v1'), '{not json');
  assert.equal(mem.has('fitness.v1.corrupt'), false);
});

test('store: quota failure on save -> read-only, banner persists, later mutations ignored', async () => {
  const s = await freshStore(memStorage(new Map(), { failSet: true }));
  s.saveTemplate({ name: 'A' });
  assert.equal(s.isReadOnly(), true);
  assert.match(s.getNotice(), /Spazio esaurito/);
  s.clearNotice();
  assert.match(s.getNotice(), /Spazio esaurito/);
  const n = s.getDoc().templates.length;
  s.saveTemplate({ name: 'B' });
  assert.equal(s.getDoc().templates.length, n);
});

test('store: rot on startSession / addPastSession', async () => {
  const s = await freshStore(memStorage());
  const item = { ex: 'lib_panca_piana', rest: 90, sets: [{ reps: [8, 10], kg: 60 }] };
  const a = s.saveTemplate({ name: 'A', items: [item] });
  const b = s.saveTemplate({ name: 'B', items: [item] });
  const today = todayKey();
  const pid = s.saveProgram({ name: 'Rot', kind: 'rotation', seq: [a, b], days: [0, 1, 2, 3, 4, 5, 6] });
  s.activateProgram(pid, addDays(today, -30));
  const rotOf = (id) => s.getDoc().sessions.find((x) => x.id === id).rot;
  const s1 = s.startSession({ tpl: a });
  assert.deepEqual(rotOf(s1), { p: pid, i: 0 });
  s.finishSession(s1);
  const s2 = s.startSession({ tpl: a });                       // next is now b
  assert.equal(rotOf(s2), null);
  const s3 = s.startSession({ tpl: b });
  assert.deepEqual(rotOf(s3), { p: pid, i: 1 });
  s.discardSession(s2);
  s.discardSession(s3);
  assert.deepEqual(rotOf(s.addPastSession({ date: addDays(today, -2), tpl: b })), { p: pid, i: 1 });
  assert.equal(rotOf(s.addPastSession({ date: addDays(today, -2), tpl: a })), null);
  assert.equal(rotOf(s.addPastSession({ date: addDays(today, -60), tpl: b })), null);   // before activation
});

test('store: finishSession ignores ended sessions; exercise names are trimmed to 40', async () => {
  const s = await freshStore(memStorage());
  const sid = s.startSession({});
  s.finishSession(sid, { rpe: 5 });
  const end = s.getDoc().sessions[0].end;
  s.finishSession(sid, { rpe: 9 });
  assert.equal(s.getDoc().sessions[0].rpe, 5);
  assert.equal(s.getDoc().sessions[0].end, end);
  const x = s.saveExercise({ name: `  ${'n'.repeat(60)}  ` });
  assert.equal(s.getDoc().exercises.find((e) => e.id === x).name.length, 40);
});

test('store: concluded program activates as a copy; endProgram future vs active', async () => {
  const s = await freshStore(memStorage());
  const today = todayKey();
  const old = s.saveProgram({ name: 'Old', kind: 'free' });
  s.activateProgram(old, addDays(today, -20), addDays(today, -10));
  const used = s.activateProgram(old, today);
  assert.notEqual(used, old);
  assert.equal(s.getDoc().programs.find((p) => p.id === old).to, addDays(today, -10));
  assert.equal(s.getDoc().programs.find((p) => p.id === used).from, today);
  const fut = s.saveProgram({ name: 'Fut', kind: 'free' });
  s.activateProgram(fut, addDays(today, 5));
  s.endProgram(fut);
  const f = s.getDoc().programs.find((p) => p.id === fut);
  assert.deepEqual([f.from, f.to], [null, null]);
  s.endProgram(used);
  assert.equal(s.getDoc().programs.find((p) => p.id === used).to, addDays(today, -1));
});

// Wake lock: fake navigator/document installed before a fresh timer.js import (its visibility listener is registered at import).
let freshTimer = 0;
const flush = () => new Promise((r) => setImmediate(r));
async function withWakeLock(fn) {
  const saved = ['navigator', 'document'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  const requests = [];
  const pending = [];
  const visibility = {};
  const sentinel = () => ({
    released: 0,
    handlers: [],
    release() { this.released++; return Promise.resolve(); },
    addEventListener(type, fn) { this.handlers.push(fn); },
  });
  const define = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  define('navigator', { wakeLock: { request(type) { requests.push(type); return new Promise((res, rej) => pending.push({ res, rej })); } } });
  define('document', {
    visibilityState: 'visible',
    addEventListener(type, fn) { visibility[type] = fn; },
  });
  try {
    const t = await import(`../js/timer.js?case=${++freshTimer}`);
    await fn({ t, requests, pending, sentinel, onVisible: () => visibility.visibilitychange?.() });
  } finally {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
    }
  }
}

test('wake lock: concurrent keepAwake(true) and visibility re-request while pending -> one request, no leak', async () => {
  await withWakeLock(async ({ t, requests, pending, sentinel, onVisible }) => {
    t.keepAwake(true);
    t.keepAwake(true);
    onVisible();
    assert.equal(requests.length, 1);
    const l = sentinel();
    pending[0].res(l);
    await flush();
    assert.equal(requests.length, 1);
    t.keepAwake(true);                // already held: no new request
    onVisible();
    assert.equal(requests.length, 1);
    t.keepAwake(false);
    assert.equal(l.released, 1);
  });
});

test('wake lock: keepAwake(false) during pending request releases the sentinel on arrival', async () => {
  await withWakeLock(async ({ t, requests, pending, sentinel }) => {
    t.keepAwake(true);
    t.keepAwake(false);
    const l = sentinel();
    pending[0].res(l);
    await flush();
    assert.equal(l.released, 1);
    assert.equal(requests.length, 1);
    t.keepAwake(true);                // a new request after the release is allowed
    assert.equal(requests.length, 2);
  });
});

test('wake lock: off-on during a refused request re-requests once, refusal does not loop', async () => {
  await withWakeLock(async ({ t, requests, pending, sentinel }) => {
    t.keepAwake(true);
    t.keepAwake(false);
    t.keepAwake(true);
    pending[0].rej(new Error('NotAllowedError'));
    await flush();
    assert.equal(requests.length, 2);
    pending[1].rej(new Error('NotAllowedError'));
    await flush();
    assert.equal(requests.length, 2);
    const l = sentinel();
    t.keepAwake(false);
    t.keepAwake(true);
    pending[2].res(l);
    await flush();
    t.keepAwake(false);
    assert.equal(l.released, 1);
  });
});
