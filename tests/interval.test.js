import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timerSteps, timerMinutes, totalSec, advance, clock, isTimed } from '../js/interval.js';

const item = (ex, part, sec, rest, n = 1) => ({ ex, part, rest, sets: Array.from({ length: n }, () => ({ sec })) });
const day = (o = {}) => ({
  mode: 'timer', rounds: 2, roundRest: 60,
  items: [item('jog', 'warm', 120, 10), item('burpee', 'main', 40, 20, 2), item('plank', 'main', 30, 15, 2), item('stretch', 'cool', 60, 0)],
  ...o,
});
const brief = (steps) => steps.map((s) => (s.type === 'work' ? `${s.i}:${s.round}:${s.sec}` : `p${s.sec}`));

test('timerSteps: warm-up once, rounds with round rest, cool-down once, no trailing pause', () => {
  assert.equal(isTimed(day()), true);
  assert.equal(isTimed({ mode: undefined }), false);
  const steps = timerSteps(day());
  assert.deepEqual(brief(steps), ['0:0:120', 'p10', '1:0:40', 'p20', '2:0:30', 'p60', '1:1:40', 'p20', '2:1:30', 'p0', '3:0:60'].filter((x) => x !== 'p0'));
  assert.deepEqual(steps.filter((s) => s.type === 'work' && s.i === 1).map((s) => s.set), [0, 1]);
  assert.equal(totalSec(steps), 120 + 10 + 40 + 20 + 30 + 60 + 40 + 20 + 30 + 60);
  assert.equal(timerMinutes(day()), 7);
  // one round, no warm-up / cool-down: the last pause is dropped
  assert.deepEqual(brief(timerSteps(day({ rounds: 1, items: [item('a', 'main', 30, 10), item('b', 'main', 30, 10)] }))), ['0:0:30', 'p10', '1:0:30']);
  assert.deepEqual(timerSteps(day({ items: [] })), []);
  assert.equal(timerMinutes(day({ items: [] })), 0);
});

test('advance: ticking, skipping several steps in the background, finishing', () => {
  const steps = timerSteps(day({ rounds: 1, items: [item('a', 'main', 30, 10), item('b', 'main', 20, 0)] }));   // 30, p10, 20
  assert.deepEqual(advance(steps, 0, 0, 0), { idx: 0, left: 30, done: [], finished: false, startedAt: 0 });
  assert.deepEqual(advance(steps, 0, 0, 29500), { idx: 0, left: 1, done: [], finished: false, startedAt: 0 });
  assert.deepEqual(advance(steps, 0, 0, 35000), { idx: 1, left: 5, done: [0], finished: false, startedAt: 30000 });
  assert.deepEqual(advance(steps, 0, 0, 45000), { idx: 2, left: 15, done: [0], finished: false, startedAt: 40000 });
  const end = advance(steps, 0, 0, 99000);
  assert.deepEqual([end.idx, end.finished, end.done], [3, true, [0, 2]]);
  assert.equal(clock(65), '1:05');
  assert.equal(clock(-3), '0:00');
});
