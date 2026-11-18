// Timed days ("A tempo"): the sequence of steps a timed template plays. Pure: no DOM, no storage.
// A timed template has mode 'timer', rounds (>= 1), roundRest (s), coolRest (s, before the cool-down) and items { ex, part: 'warm' | 'main' | 'cool', sec, rest }:
// warm-up items play once, then the main items `rounds` times (roundRest between rounds), then the cool-down items once.
// Each item keeps sets [{ sec }] (one per round for main items) so the generic code (counts, estimates) still works.

export const PARTS = ['warm', 'main', 'cool'];
export const PART_LABELS = { warm: 'Riscaldamento', main: 'Circuito', cool: 'Defaticamento' };

export const isTimed = (t) => t?.mode === 'timer';

/** Side or direction of an exercise from its note, as a short tag: D / S (destra / sinistra), O / A (orario /
 *  antiorario), Avanti / Indietro ("in avanti", "all'indietro"); '' when the note names none. Only the first part of
 *  the note counts ("Gamba sinistra · …"), so a hint further on does not tag it. */
export function sideTag(note) {
  const n = String(note ?? '').split('·')[0].toLowerCase();
  if (/antiorari/.test(n)) return 'A';
  if (/\borari/.test(n)) return 'O';
  if (/\bdestr/.test(n)) return 'D';
  if (/\bsinistr/.test(n)) return 'S';
  if (/\bin avanti\b/.test(n)) return 'Avanti';
  if (/all.indietro\b/.test(n)) return 'Indietro';
  return '';
}

const secOf = (it) => Math.max(0, Math.round(Number(it.sets?.[0]?.sec ?? it.sec) || 0));
const restOf = (it) => Math.max(0, Math.round(Number(it.rest) || 0));

/**
 * Steps of a timed template, in order:
 * { type: 'work', i (item index), part, round (0-based, main only; 0 otherwise), set (index in the item's sets), sec }
 * { type: 'rest', part, round, sec } — the pause after an item, or between rounds (roundRest replaces the last item's pause);
 * after the last round, coolRest (if there is a cool-down).
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
  const cool = byPart('cool');
  const rounds = Math.max(1, Math.round(Number(t.rounds) || 1));
  for (let r = 0; r < rounds && main.length; r++) {
    main.forEach(({ it, i }, k) => {
      push({ type: 'work', i, part: 'main', round: r, set: Math.min(r, (it.sets?.length || 1) - 1), sec: secOf(it) });
      const last = k === main.length - 1;
      push({ type: 'rest', part: 'main', round: r, sec: !last ? restOf(it) : r < rounds - 1 ? restOf({ rest: t.roundRest }) : cool.length ? restOf({ rest: t.coolRest }) : 0 });
    });
  }
  for (const { it, i } of cool) {
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

// ---- Voice announcements --------------------------------------------------------------

/** Seconds a cue takes to say (Italian speech ≈ 13 characters a second, plus the engine's start). */
export const speakSec = (text) => 0.4 + String(text).length / 13;

/** What is said for work step k: the part or round it opens, then "Prossimo: <name>" (nameOf(i) gives the name). */
export function cueText(steps, k, nameOf) {
  const w = steps[k];
  let j = k - 1;
  while (j >= 0 && steps[j].type !== 'work') j--;
  const p = steps[j];
  let pre = '';
  if (p && w.part === 'main' && p.part !== 'main') pre = 'Circuito. ';
  else if (p && w.part === 'main' && p.round !== w.round) pre = `Giro ${w.round + 1}. `;
  else if (p && w.part === 'cool' && p.part !== 'cool') pre = 'Defaticamento. ';
  return `${pre}Prossimo: ${nameOf(w.i)}`;
}

/**
 * Voice announcement of the next exercise during step idx: { k (work step announced), text, leftAt } — to be said when
 * the step's seconds left reach leftAt — or null. Each exercise is announced once, never over a beep:
 * - in a pause (or the start), right after the change beep, if it ends before the last `warn` beeps;
 * - otherwise (no pause, or one too short) near the end of the exercise before: ending just before its last beeps,
 *   moved before its halfway beep if the two would overlap; never in its first second.
 */
export function voiceCue(steps, idx, nameOf, { warn = 3, halfFrom = 30 } = {}) {
  const x = steps[idx];
  if (!x) return null;
  let k = idx + 1;
  while (k < steps.length && steps[k].type !== 'work') k++;
  if (k >= steps.length) return null;
  const text = cueText(steps, k, nameOf);
  const dur = speakSec(text);
  const fitsPause = (r) => r.sec - (r.type === 'prep' ? 0.3 : 0.7) - warn - 0.3 >= dur;
  if (x.type !== 'work') return fitsPause(x) ? { k, text, leftAt: x.sec - (x.type === 'prep' ? 0.3 : 0.7) } : null;
  const r = steps[idx + 1];
  if (r.type !== 'work' && fitsPause(r)) return null;                    // said in the pause
  let leftAt = warn + 0.4 + dur;
  const half = x.sec > halfFrom ? x.sec / 2 : null;
  if (half != null && half > leftAt - dur - 0.3 && half < leftAt + 0.3) leftAt = half + 0.3 + dur;
  return leftAt <= x.sec - 1 ? { k, text, leftAt } : null;
}

/** "m:ss". */
export function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
