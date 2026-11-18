import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewSteps } from '../js/views/preview.js';
import { emptyDoc } from '../js/logic.js';

const D = emptyDoc();
const it = (ex, part, sec, rest, note = '', n = 1) => ({ ex, part, note, rest, sets: Array.from({ length: n }, () => ({ sec })) });

test('previewSteps: warm-up, circuit once, cool-down; times and pauses as the timer plays them', () => {
  const t = { mode: 'timer', rounds: 3, roundRest: 60, coolRest: 45, items: [
    it('lib_plank', 'main', 45, 15, '', 3), it('lib_jumping_jack', 'warm', 30, 0),
    it('lib_plank_laterale', 'main', 25, 5, 'Fianco destro', 3), it('lib_gambe_al_muro', 'cool', 60, 0)] };
  const s = previewSteps(D, t);
  assert.deepEqual(s.map((x) => [x.part, x.i]), [['warm', 1], ['main', 0], ['main', 2], ['cool', 3]]);
  assert.equal(s[0].line, '30 s · senza pausa');
  assert.equal(s[1].line, '45 s · 15 s di pausa');
  assert.equal(s[2].line, '25 s · 60 s tra un giro e l’altro');
  assert.equal(s[2].note, 'Fianco destro');
});

test('previewSteps: one round has no round pause; a normal day lists its sets', () => {
  const one = { mode: 'timer', rounds: 1, roundRest: 60, items: [it('lib_plank', 'main', 30, 10), it('lib_dead_bug', 'main', 40, 20)] };
  assert.equal(previewSteps(D, one).at(-1).line, '40 s · senza pausa');
  const normal = { items: [{ ex: 'lib_squat_corpo_libero', note: '', sets: [{ w: true, reps: [5] }, { reps: [10], kg: 40 }, { reps: [10], kg: 40 }] }] };
  assert.deepEqual(previewSteps(D, normal).map((x) => [x.part, x.line]), [[null, '2 serie · 10 rip · 40 kg']]);
  assert.deepEqual(previewSteps(D, { items: [] }), []);
});
