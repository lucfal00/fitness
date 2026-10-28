// Pure output checks for ui helpers, stackedBars and bodyMap; store smoke test with a fake localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtKg, fmtDuration, esc, safeColor } from '../js/ui.js';
import { stackedBars } from '../js/charts.js';
import { bodyMap } from '../js/bodymap.js';
import { GROUPS } from '../js/library.js';

test('ui formatting', () => {
  assert.equal(fmtKg(62.5), '62,5');
  assert.equal(fmtKg(60), '60');
  assert.equal(fmtDuration(65), '1:05');
  assert.equal(fmtDuration(3725), '1:02:05');
  assert.equal(esc('<a "b">'), '&lt;a &quot;b&quot;&gt;');
  assert.equal(safeColor('red'), '#f97316');
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
