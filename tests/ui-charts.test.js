// Pure output checks for ui helpers, stackedBars and bodyMap; store smoke test with a fake localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtKg, fmtDuration, esc, safeColor } from '../js/ui.js';
import { stackedBars } from '../js/charts.js';
import { bodyMap } from '../js/bodymap.js';
import { GROUPS } from '../js/library.js';
import * as L from '../js/logic.js';
import { todayKey, addDays, emptyDoc } from '../js/logic.js';

test('ui formatting', () => {
  assert.equal(fmtKg(62.5), '62,5');
  assert.equal(fmtKg(60), '60');
  assert.equal(fmtDuration(65), '1:05');
  assert.equal(fmtDuration(3725), '1:02:05');
  assert.equal(esc('<a "b">'), '&lt;a &quot;b&quot;&gt;');
  assert.equal(safeColor('red'), '#2f8f4a');
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

// ---- Schede ----------------------------------------------------------------

test('store: saveScheda + addSchedaDay build template days in seq order', async () => {
  const s = await freshStore(memStorage());
  const sid = s.saveScheda({ name: '  Push Pull  ', emoji: '🏋️', color: '#112233', perWeek: 3, days: null });
  const p = s.getDoc().programs.find((x) => x.id === sid);
  assert.deepEqual([p.kind, p.name, p.emoji, p.color, p.perWeek, p.days, p.from, p.to], ['rotation', 'Push Pull', '🏋️', '#112233', 3, null, null, null]);
  assert.deepEqual(p.seq, []);
  const item = { ex: 'lib_panca_piana', rest: 90, sets: [{ reps: [8, 10], kg: 60 }] };
  const a = s.addSchedaDay(sid, { dayName: 'Petto', items: [item] });
  const b = s.addSchedaDay(sid);
  const c = s.addSchedaDay(sid, { dayName: 'Gambe' });
  const d = s.getDoc();
  assert.deepEqual(d.programs.find((x) => x.id === sid).seq, [a, b, c]);
  const ts = [a, b, c].map((id) => d.templates.find((t) => t.id === id));
  assert.deepEqual(ts.map((t) => t.scheda), [sid, sid, sid]);
  assert.deepEqual(ts.map((t) => t.dayName), ['Petto', 'Giorno 2', 'Gambe']);          // "Giorno <position>"
  assert.deepEqual(ts.map((t) => t.name), ['Push Pull · Petto', 'Push Pull · Giorno 1', 'Push Pull · Gambe']);
  assert.equal(ts[0].items.length, 1);
  assert.deepEqual(ts[1].items, []);
  assert.deepEqual([ts[0].emoji, ts[0].color], ['🏋️', '#112233']);
  assert.equal(s.addSchedaDay('nope'), null);
  // update keeps seq / activation; perWeek is clamped, days normalised
  s.activateProgram(sid, '2026-11-02');
  s.saveScheda({ id: sid, name: 'Nuova', emoji: '🔥', color: '#445566', perWeek: 99, days: [5, 1, 1, 9] });
  const q = s.getDoc().programs.find((x) => x.id === sid);
  assert.deepEqual([q.name, q.perWeek, q.days, q.seq, q.from], ['Nuova', 7, [1, 5], [a, b, c], '2026-11-02']);
  const ta = s.getDoc().templates.find((t) => t.id === a);
  assert.deepEqual([ta.color, ta.emoji, ta.name, ta.dayName], ['#445566', '🔥', 'Nuova · Petto', 'Petto']);
  assert.equal(s.getDoc().templates.find((t) => t.id === b).name, 'Nuova · Giorno 1');
  s.saveScheda({ id: sid, name: 'Nuova', emoji: '🔥', color: '#445566', perWeek: 0, days: [] });
  const r = s.getDoc().programs.find((x) => x.id === sid);
  assert.deepEqual([r.perWeek, r.days], [1, null]);
});

test('store: saveSchedaDay, moveSchedaDay, duplicateSchedaDay', async () => {
  const s = await freshStore(memStorage());
  const sid = s.saveScheda({ name: 'S', emoji: '💪', color: '#2f8f4a', perWeek: 3, days: null });
  const [a, b, c] = ['A', 'B', 'C'].map((n) => s.addSchedaDay(sid, { dayName: n }));
  const seq = () => s.getDoc().programs.find((x) => x.id === sid).seq;
  s.saveSchedaDay(b, { dayName: '  Dorso  ', items: [{ ex: 'lib_panca_piana', sets: [{ reps: [5, 5] }] }] });
  const tb = s.getDoc().templates.find((t) => t.id === b);
  assert.deepEqual([tb.dayName, tb.items.length], ['Dorso', 1]);
  s.moveSchedaDay(c, -1);
  assert.deepEqual(seq(), [a, c, b]);
  s.moveSchedaDay(a, -1);                       // already first
  s.moveSchedaDay(b, +1);                       // already last
  assert.deepEqual(seq(), [a, c, b]);
  s.moveSchedaDay(a, +1);
  assert.deepEqual(seq(), [c, a, b]);
  const copy = s.duplicateSchedaDay(a);
  assert.deepEqual(seq(), [c, a, copy, b]);
  const tc = s.getDoc().templates.find((t) => t.id === copy);
  assert.deepEqual([tc.scheda, tc.dayName, tc.deleted], [sid, 'A (copia)', false]);
  assert.notEqual(tc.id, a);
});

test('store: deleteSchedaDay leaves seq (soft delete), also the last day; deleteScheda soft-deletes scheda and days', async () => {
  const s = await freshStore(memStorage());
  const sid = s.saveScheda({ name: 'S', emoji: '💪', color: '#2f8f4a', perWeek: 2, days: null });
  const [a, b] = [s.addSchedaDay(sid), s.addSchedaDay(sid)];
  const seq = () => s.getDoc().programs.find((x) => x.id === sid).seq;
  s.deleteSchedaDay(a);
  assert.deepEqual(seq(), [b]);
  assert.equal(s.getDoc().templates.find((t) => t.id === a).deleted, true);
  s.deleteSchedaDay(b);
  assert.deepEqual(seq(), []);
  const c = s.addSchedaDay(sid);
  const other = s.saveScheda({ name: 'O', emoji: '💪', color: '#2f8f4a', perWeek: 1, days: null });
  const o = s.addSchedaDay(other);
  s.deleteScheda(sid);
  const d = s.getDoc();
  assert.equal(d.programs.find((x) => x.id === sid).deleted, true);
  assert.equal(d.templates.find((t) => t.id === c).deleted, true);
  assert.equal(d.programs.find((x) => x.id === other).deleted, false);
  assert.equal(d.templates.find((t) => t.id === o).deleted, false);
});

test('store: scheda mutators are no-ops when read-only', async () => {
  const s = await freshStore({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.equal(s.saveScheda({ name: 'X', perWeek: 1, days: null }), null);
  assert.equal(s.addSchedaDay('p'), null);
  assert.equal(s.duplicateSchedaDay('t'), null);
  s.saveSchedaDay('t', { dayName: 'x' });
  s.moveSchedaDay('t', 1);
  s.deleteSchedaDay('t');
  s.deleteScheda('p');
  assert.deepEqual(s.getDoc().programs, []);
});

test('store: migration wraps loose templates in 1-day schede, is idempotent and saves only on change', async () => {
  const mem = new Map();
  const d0 = emptyDoc();
  const t = (id, name, o = {}) => ({ id, name, emoji: '🔥', color: '#aa0000', items: [], order: 0, archived: false, deleted: false, updatedAt: 1, ...o });
  d0.templates = [t('t_aaaaaa', 'Push'), t('t_bbbbbb', 'Pull', { emoji: '🚣', color: '#0000aa', archived: true }), t('t_cccccc', 'Gone', { deleted: true }),
    t('t_dddddd', 'Already', { scheda: 'p_exists', dayName: 'Giorno 1' })];
  d0.programs = [{ id: 'p_exists', name: 'Exists', kind: 'rotation', perWeek: 1, days: null, seq: ['t_dddddd'], weeks: [], from: null, to: null, deleted: false, updatedAt: 1 }];
  mem.set('fitness.v1', JSON.stringify(d0));
  const s1 = await freshStore(memStorage(mem));
  const docA = s1.getDoc();
  assert.equal(docA.programs.filter((p) => p.id !== 'p_exists').length, 2);
  for (const [tid, name, emoji, color] of [['t_aaaaaa', 'Push', '🔥', '#aa0000'], ['t_bbbbbb', 'Pull', '🚣', '#0000aa']]) {
    const tpl = docA.templates.find((x) => x.id === tid);
    const p = docA.programs.find((x) => x.id === tpl.scheda);
    assert.deepEqual([p.kind, p.name, p.emoji, p.color, p.perWeek, p.days, p.from, p.to, p.seq, p.deleted], ['rotation', name, emoji, color, 1, null, null, null, [tid], false]);
    assert.equal(tpl.dayName, 'Giorno 1');
  }
  assert.equal(docA.templates.find((x) => x.id === 't_cccccc').scheda, undefined);
  assert.equal(docA.templates.find((x) => x.id === 't_dddddd').scheda, 'p_exists');
  assert.equal(JSON.parse(mem.get('fitness.v1')).programs.length, 3);       // persisted
  // second load: nothing changes, nothing is written
  let writes = 0;
  const counting = { ...memStorage(mem), setItem: (k, v) => { writes++; mem.set(k, String(v)); } };
  const s2 = await freshStore(counting);
  assert.deepEqual(s2.getDoc().programs.map((p) => p.id).sort(), docA.programs.map((p) => p.id).sort());
  assert.equal(writes, 0);
});

test('store: reactivating a concluded scheda clones its days; the copy is independent', async () => {
  const s = await freshStore(memStorage());
  const today = todayKey();
  const item = { ex: 'lib_panca_piana', rest: 90, sets: [{ reps: [8, 10], kg: 60 }] };
  const old = s.saveScheda({ name: 'Old', emoji: '🏋️', color: '#112233', perWeek: 3, days: null });
  const [a, b, c] = ['A', 'B', 'C'].map((n) => s.addSchedaDay(old, { dayName: n, items: [item] }));
  s.activateProgram(old, addDays(today, -20), addDays(today, -10));
  const used = s.activateProgram(old, today);
  assert.notEqual(used, old);
  const d = s.getDoc();
  const seqOf = (id) => d.programs.find((p) => p.id === id).seq;
  const tpl = (id) => d.templates.find((t) => t.id === id);
  const copies = [...seqOf(used)];
  assert.equal(copies.length, 3);
  assert.equal(new Set([a, b, c, ...copies]).size, 6);                       // new ids
  assert.deepEqual(seqOf(old), [a, b, c]);
  assert.deepEqual(copies.map((id) => tpl(id).scheda), [used, used, used]);
  assert.deepEqual(copies.map((id) => tpl(id).dayName), ['A', 'B', 'C']);   // seq in order
  assert.deepEqual(copies.map((id) => tpl(id).name), ['Old · A', 'Old · B', 'Old · C']);
  assert.deepEqual([tpl(copies[0]).emoji, tpl(copies[0]).color, tpl(copies[0]).items], ['🏋️', '#112233', [item]]);
  tpl(copies[0]).items[0].sets[0].kg = 1;                                     // deep copy of the items
  assert.equal(tpl(a).items[0].sets[0].kg, 60);
  assert.deepEqual([a, b, c].map((id) => tpl(id).scheda), [old, old, old]);
  // editing the copy leaves the original alone
  s.moveSchedaDay(copies[1], -1);
  s.duplicateSchedaDay(copies[0]);
  s.deleteSchedaDay(copies[2]);
  s.saveScheda({ id: used, name: 'Copia' });
  assert.deepEqual(seqOf(old), [a, b, c]);
  assert.deepEqual([a, b, c].map((id) => tpl(id).deleted), [false, false, false]);
  assert.equal(d.programs.find((p) => p.id === old).name, 'Old');
  assert.equal(L.workoutLabel(d, a), 'Old · A');
  assert.equal(L.workoutLabel(d, copies[0]), 'Copia · A');
  assert.equal(d.templates.filter((t) => t.scheda === old).length, 3);
  // deleting the original leaves the copy's days intact
  s.deleteScheda(old);
  assert.equal(d.programs.find((p) => p.id === used).deleted, false);
  assert.deepEqual([copies[0], copies[1]].map((id) => tpl(id).deleted), [false, false]);
  assert.deepEqual([a, b, c].map((id) => tpl(id).deleted), [true, true, true]);
  // a non-scheda rotation keeps the plain copy (shared seq, no new templates)
  const r = s.saveProgram({ name: 'R', kind: 'rotation', seq: [copies[0]] });
  s.activateProgram(r, addDays(today, -20), addDays(today, -10));
  const n = d.templates.length;
  const r2 = s.activateProgram(r, today);
  assert.notEqual(r2, r);
  assert.deepEqual(d.programs.find((p) => p.id === r2).seq, [copies[0]]);
  assert.equal(d.templates.length, n);
});

test('store: saveScheda guards, color, propagation; day names, moves and labels', async () => {
  const s = await freshStore(memStorage());
  const sid = s.saveScheda({ name: 'S', emoji: '💪', color: 'red', perWeek: 3, days: null });
  const d = s.getDoc();
  assert.equal(d.programs.find((p) => p.id === sid).color, '#2f8f4a');           // invalid colour -> default
  const [a, b] = [s.addSchedaDay(sid), s.addSchedaDay(sid)];
  assert.deepEqual([a, b].map((id) => d.templates.find((t) => t.id === id).dayName), ['Giorno 1', 'Giorno 2']);
  s.deleteSchedaDay(a);
  const c = s.addSchedaDay(sid);                                                  // next position, skipping used names
  assert.equal(d.templates.find((t) => t.id === c).dayName, 'Giorno 3');
  // only name / emoji / color reach the day templates
  const tb = d.templates.find((t) => t.id === b);
  tb.updatedAt = 1;
  s.saveScheda({ id: sid, name: 'S', emoji: '💪', color: '#2f8f4a', perWeek: 5, days: [1, 3, 5] });
  assert.equal(tb.updatedAt, 1);
  s.saveScheda({ id: sid, color: 'javascript:1' });
  assert.equal(d.programs.find((p) => p.id === sid).color, '#2f8f4a');
  assert.equal(tb.updatedAt, 1);
  s.saveScheda({ id: sid, color: '#0000ff' });
  assert.deepEqual([tb.color, tb.updatedAt > 1], ['#0000ff', true]);
  // unknown, deleted or non-rotation ids are no-ops
  assert.equal(s.saveScheda({ id: 'nope', name: 'X' }), null);
  const free = s.saveProgram({ name: 'F', kind: 'free' });
  const freeBefore = JSON.stringify(d.programs.find((p) => p.id === free));
  assert.equal(s.saveScheda({ id: free, name: 'X', perWeek: 2 }), null);
  assert.equal(JSON.stringify(d.programs.find((p) => p.id === free)), freeBefore);
  s.deleteScheda(sid);
  const deleted = JSON.stringify(d);
  assert.equal(s.saveScheda({ id: sid, name: 'Back' }), null);
  assert.equal(JSON.stringify(d), deleted);
  assert.equal(d.programs.length, 2);
  // moveSchedaDay accepts only +-1
  const s2 = await freshStore(memStorage());
  const id2 = s2.saveScheda({ name: 'M', perWeek: 3 });
  const [x, y, z] = [1, 2, 3].map(() => s2.addSchedaDay(id2));
  const seq2 = () => s2.getDoc().programs.find((p) => p.id === id2).seq;
  s2.moveSchedaDay(x, 2);
  s2.moveSchedaDay(z, -2);
  s2.moveSchedaDay(y, 0.5);
  s2.moveSchedaDay(y, '1');
  s2.moveSchedaDay(y, NaN);
  assert.deepEqual(seq2(), [x, y, z]);
  s2.moveSchedaDay(y, 1);
  assert.deepEqual(seq2(), [x, z, y]);
  // label: the scheda part is cut, the day name stays whole, <= 60 characters
  const long = s2.saveScheda({ name: 'N'.repeat(60) });
  const day = 'D'.repeat(40);
  const tid = s2.addSchedaDay(long, { dayName: day });
  const t = s2.getDoc().templates.find((q) => q.id === tid);
  assert.equal(t.name.length, 60);
  assert.equal(t.name, `${'N'.repeat(17)} · ${day}`);
  const sid2 = s2.addSchedaDay(id2, { dayName: 'Petto' });
  assert.equal(s2.getDoc().templates.find((q) => q.id === sid2).name, 'M · Petto');
});

test('store: migration re-attaches to its deterministic scheda and never bumps updatedAt', async () => {
  const mem = new Map();
  const d0 = emptyDoc();
  const t = (id, name, o = {}) => ({ id, name, emoji: '🔥', color: '#aa0000', items: [], order: 0, archived: false, deleted: false, updatedAt: 7, ...o });
  const p = (id, seq, o = {}) => ({ id, name: id, kind: 'rotation', perWeek: 1, days: null, seq, weeks: [], from: null, to: null, deleted: false, updatedAt: 3, ...o });
  d0.templates = [t('t_aaaaaa', 'Re'), t('t_bbbbbb', 'Clash'), t('t_cccccc', 'Loose', { updatedAt: 42 }), t('t_dddddd', 'NoStamp', { updatedAt: undefined })];
  d0.programs = [p('p_aaaaaa', ['t_aaaaaa']), p('p_bbbbbb', ['t_other'])];
  mem.set('fitness.v1', JSON.stringify(d0));
  const s = await freshStore(memStorage(mem));
  const d = s.getDoc();
  const tpl = (id) => d.templates.find((x) => x.id === id);
  assert.equal(tpl('t_aaaaaa').scheda, 'p_aaaaaa');                                  // re-attached, no second scheda
  assert.equal(tpl('t_aaaaaa').dayName, 'Giorno 1');
  assert.equal(d.programs.filter((x) => x.seq.includes('t_aaaaaa')).length, 1);
  assert.equal(d.programs.find((x) => x.id === 'p_aaaaaa').updatedAt, 3);
  assert.notEqual(tpl('t_bbbbbb').scheda, 'p_bbbbbb');                               // id taken by an unrelated scheda
  assert.deepEqual(d.programs.find((x) => x.id === tpl('t_bbbbbb').scheda).seq, ['t_bbbbbb']);
  assert.equal(d.programs.length, 5);
  assert.equal(tpl('t_aaaaaa').updatedAt, 7);                                        // templates keep their stamp
  assert.equal(tpl('t_bbbbbb').updatedAt, 7);
  assert.equal(tpl('t_cccccc').updatedAt, 42);
  assert.equal(d.programs.find((x) => x.id === tpl('t_cccccc').scheda).updatedAt, 42);
  assert.equal(tpl('t_dddddd').updatedAt, undefined);
  assert.equal(d.programs.find((x) => x.id === tpl('t_dddddd').scheda).updatedAt, 0);
  const ids = d.programs.map((x) => x.id).sort();
  const s2 = await freshStore(memStorage(mem));                                     // idempotent
  assert.deepEqual(s2.getDoc().programs.map((x) => x.id).sort(), ids);
});

test('store: migration also runs after importBackup', async () => {
  const mem = new Map();
  const s = await freshStore(memStorage(mem));
  const d0 = emptyDoc();
  d0.templates = [{ id: 't_eeeeee', name: 'Imported', emoji: '🔥', color: '#aa0000', items: [], order: 0, archived: false, deleted: false, updatedAt: 9 }];
  const file = { text: async () => JSON.stringify(d0) };
  await s.importBackup(file);
  const d = s.getDoc();
  const tpl = d.templates.find((x) => x.id === 't_eeeeee');
  assert.equal(tpl.updatedAt, 9);
  assert.equal(tpl.dayName, 'Giorno 1');
  const prog = d.programs.find((x) => x.id === tpl.scheda);
  assert.deepEqual([prog.name, prog.kind, prog.seq, prog.updatedAt], ['Imported', 'rotation', ['t_eeeeee'], 9]);
  assert.equal(JSON.parse(mem.get('fitness.v1')).programs.length, 1);              // persisted
  await s.importBackup(file);                                                       // idempotent
  assert.equal(s.getDoc().programs.length, 1);
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
