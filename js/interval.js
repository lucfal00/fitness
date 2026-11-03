// Timed days ("A tempo"): the sequence of steps a timed template plays. Pure: no DOM, no storage.
// A timed template has mode 'timer', rounds (>= 1), roundRest (s) and items { ex, part: 'warm' | 'main' | 'cool', sec, rest }:
// warm-up items play once, then the main items `rounds` times (roundRest between rounds), then the cool-down items once.
// Each item keeps sets [{ sec }] (one per round for main items) so the generic code (counts, estimates) still works.

export const PARTS = ['warm', 'main', 'cool'];
export const PART_LABELS = { warm: 'Riscaldamento', main: 'Circuito', cool: 'Defaticamento' };

export const isTimed = (t) => t?.mode === 'timer';

const secOf = (it) => Math.max(0, Math.round(Number(it.sets?.[0]?.sec ?? it.sec) || 0));
const restOf = (it) => Math.max(0, Math.round(Number(it.rest) || 0));

/**
 * Steps of a timed template, in order:
 * { type: 'work', i (item index), part, round (0-based, main only; 0 otherwise), set (index in the item's sets), sec }
 * { type: 'rest', part, round, sec } — the pause after an item, or between rounds (roundRest replaces the last item's pause).
 * No pause at the very end; zero-second steps are left out.
 */
export function timerSteps(t) {
  const steps = [];
  const items = t.items.map((it, i) => ({ it, i })).filter(({ it }) => secOf(it) > 0);
  const byPart = (p) => items.filter(({ it }) => (it.part ?? 'main') === p);
  const push = (s) => { if (s.sec > 0) steps.push(s); };
  for (const { it, i } of byPart('warm')) {
    push({ type: 'work', i, part: 'warm', round: 0, set: 0, sec: secOf(it) });
    push({ type: 'rest', part: 'warm', round: 0, sec: restOf(it) });
  }
  const main = byPart('main');
  const rounds = Math.max(1, Math.round(Number(t.rounds) || 1));
  for (let r = 0; r < rounds && main.length; r++) {
    main.forEach(({ it, i }, k) => {
      push({ type: 'work', i, part: 'main', round: r, set: Math.min(r, (it.sets?.length || 1) - 1), sec: secOf(it) });
      const last = k === main.length - 1;
      push({ type: 'rest', part: 'main', round: r, sec: last ? (r < rounds - 1 ? restOf({ rest: t.roundRest }) : 0) : restOf(it) });
    });
  }
  for (const { it, i } of byPart('cool')) {
    push({ type: 'work', i, part: 'cool', round: 0, set: 0, sec: secOf(it) });
    push({ type: 'rest', part: 'cool', round: 0, sec: restOf(it) });
  }
  while (steps.length && steps[steps.length - 1].type === 'rest') steps.pop();
  return steps;
}

/** Total seconds of a step list. */
export const totalSec = (steps) => steps.reduce((a, s) => a + s.sec, 0);

/** Estimated minutes of a timed template (rounded up, at least 1 when there is anything to do). */
export function timerMinutes(t) {
  const s = totalSec(timerSteps(t));
  return s ? Math.max(1, Math.round(s / 60)) : 0;
}

/**
 * Where the timer is after `elapsedMs` of running from the start of step `idx`:
 * { idx, left (s, ceil), done: indexes of work steps completed on the way, finished }.
 * Used both for ticking and for catching up after the app was in the background.
 */
export function advance(steps, idx, startedAt, now) {
  const done = [];
  let i = idx;
  let t0 = startedAt;
  while (i < steps.length && now >= t0 + steps[i].sec * 1000) {
    if (steps[i].type === 'work') done.push(i);
    t0 += steps[i].sec * 1000;
    i++;
  }
  if (i >= steps.length) return { idx: steps.length, left: 0, done, finished: true, startedAt: t0 };
  return { idx: i, left: Math.ceil((t0 + steps[i].sec * 1000 - now) / 1000), done, finished: false, startedAt: t0 };
}

/** "m:ss". */
export function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
