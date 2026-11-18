import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timerSteps, timerMinutes, totalSec, advance, clock, isTimed, voiceCue, speakSec } from '../js/interval.js';

test('voiceCue: in a pause after the change beep; before a pause too short, near the end of the exercise', () => {
  const W = (i, sec, part = 'main', round = 0) => ({ type: 'work', i, part, round, set: 0, sec });
  const P = (sec, part = 'main', round = 0) => ({ type: 'rest', part, round, sec });
  const name = (i) => ['Squat', 'Plank', 'Plank laterale, fianco destro', 'Respiro'][i];
  const steps = [{ type: 'prep', sec: 5, part: 'prep', round: 0 }, W(0, 40), P(20), W(1, 45), P(5), W(2, 30), P(60),
    W(0, 40, 'main', 1), W(3, 60, 'cool')];
  assert.equal(voiceCue(steps, 0, name), null);                               // 5 s start: no room before the 3 beeps
  assert.equal(voiceCue(steps, 1, name), null);                               // said in the 20 s pause instead
  assert.deepEqual(voiceCue(steps, 2, name), { k: 3, text: 'Prossimo: Plank', leftAt: 19.3 });
  const c = voiceCue(steps, 3, name);                                         // the 5 s pause is too short
  assert.equal(c.k, 5);
  assert.equal(c.text, 'Prossimo: Plank laterale, fianco destro');
  assert.ok(Math.abs(c.leftAt - speakSec(c.text) - 3.4) < 1e-9);             // ends 0.4 s before the last 3 beeps
  assert.equal(voiceCue(steps, 6, name).text, 'Giro 2. Prossimo: Squat');
  assert.equal(voiceCue(steps, 7, name).text, 'Defaticamento. Prossimo: Respiro'); // no pause: during the squat
  assert.equal(voiceCue(steps, 8, name), null);                               // nothing after the last step
});

test('voiceCue: moved before the halfway beep when they would overlap; none in a too short exercise', () => {
  const name = () => 'x'.repeat(200);
  const d = speakSec(`Prossimo: ${'x'.repeat(200)}`);
  const steps = [{ type: 'work', i: 0, part: 'main', round: 0, sec: 40 }, { type: 'work', i: 1, part: 'main', round: 0, sec: 8 }];
  assert.ok(Math.abs(voiceCue(steps, 0, name).leftAt - (20 + 0.3 + d)) < 1e-9); // ends 0.3 s before the beep at 20 s
  assert.equal(voiceCue([steps[1], steps[0]], 0, name), null);                // 8 s cannot hold it
});

test('voiceCue: "Cambio" for the same exercise on the other side, not across a round or part', () => {
  const W = (i, part = 'main', round = 0) => ({ type: 'work', i, part, round, set: 0, sec: 30 });
  const ex = ['curl', 'curl', 'plank', 'plank'];
  const isSwitch = (i, j) => ex[i] === ex[j];
  const steps = [W(0), { type: 'rest', part: 'main', round: 0, sec: 15 }, W(1), W(2), W(3), W(2, 'main', 1), W(3, 'main', 1)];
  const say = (idx) => voiceCue(steps, idx, (i) => `Esercizio ${i}`, { isSwitch })?.text;
  assert.equal(say(1), 'Cambio');                                             // curl left -> right, in the pause
  assert.equal(say(2), 'Prossimo: Esercizio 2');                              // another exercise
  assert.equal(say(3), 'Cambio');
  assert.equal(say(4), 'Giro 2. Prossimo: Esercizio 2');                      // a new round is always said in full
  assert.equal(say(5), 'Cambio');
  assert.equal(voiceCue(steps, 1, (i) => `Esercizio ${i}`).text, 'Prossimo: Esercizio 1'); // no isSwitch: full name
});

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

test('sideTag: side or direction from the first part of the note', async () => {
  const { sideTag } = await import('../js/interval.js');
  const cases = {
    'Gamba sinistra · tallone al gluteo': 'S', 'Braccio destro · palmo al muro': 'D', 'Sul fianco sinistro · avambraccio': 'S',
    'Senso orario · mani sui fianchi': 'O', 'Senso antiorario · mani sui fianchi': 'A', 'Ginocchia verso destra, braccia aperte': 'D',
    'Cerchi delle spalle in avanti': 'Avanti', 'Cerchi delle spalle all’indietro': 'Indietro',
    'Indietro, alternando le gambe · mani sui fianchi': '', 'Lombare a terra · gamba destra tesa': '', '': '',
  };
  for (const [note, tag] of Object.entries(cases)) assert.equal(sideTag(note), tag, note);
  assert.equal(sideTag(undefined), '');
});

test('timerSteps: coolRest is the pause after the last round, only when a cool-down follows', () => {
  assert.deepEqual(brief(timerSteps(day({ coolRest: 45 }))).slice(-3), ['2:1:30', 'p45', '3:0:60']);
  assert.equal(totalSec(timerSteps(day({ coolRest: 45 }))), totalSec(timerSteps(day())) + 45);
  const noCool = day({ coolRest: 45, items: day().items.filter((it) => it.part !== 'cool') });
  assert.equal(brief(timerSteps(noCool)).at(-1), '2:1:30');
});
