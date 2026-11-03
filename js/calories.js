// Calorie estimate (±20-30 %). Basal: Mifflin-St Jeor (1990). Daily life: basal × factor of a typical day, sport
// excluded. Workouts: MET (Compendium of Physical Activities 2024) × the person's own resting kcal/min (basal / 1440) ×
// minutes; without a profile 1 MET = 3.5 ml/kg/min = 3.5 × kg / 200 kcal/min. The day total adds only what a workout
// burns above the daily-life rate of those minutes ("in più"), so nothing is counted twice. Pure: no DOM or storage.
import { bodyWeightAt, estimateMinutes } from './metrics.js';
import { timerSteps, isTimed } from './interval.js';
import { resolveExercise } from './library.js';
import { isConcluded } from './logic.js';

/** Typical day without sport: factor on the basal. */
export const LIFE = {
  sit: { f: 1.2, name: 'Seduto', hint: 'Ufficio, studio' },
  stand: { f: 1.35, name: 'In piedi', hint: 'Negozio, scuola, giri a piedi' },
  active: { f: 1.5, name: 'Lavoro fisico', hint: 'Cantiere, magazzino' },
};

// [km/h, MET] of the Compendium; between two rows the MET is interpolated, outside it is clamped.
const RUN = [[6.4, 6.0], [8, 8.3], [9.7, 9.8], [10.8, 10.5], [11.3, 11.0], [12.1, 11.8], [12.9, 12.3], [13.8, 12.8],
  [14.5, 14.5], [16.1, 16.0], [17.7, 18.0], [19.3, 19.8]];
const WALK = [[3.2, 2.8], [4.0, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0], [8.0, 8.3]];
const BIKE = [[16, 4.0], [17.5, 6.8], [20.5, 8.0], [24, 10.0], [27.5, 12.0], [32, 15.8]];
const BY_SPEED = { corsa: RUN, tapis_roulant: RUN, camminata: WALK, bici: BIKE };

// MET without a distance (or for activities not measured by speed).
const ACT_MET = {
  corsa: 8.0, tapis_roulant: 8.0, camminata: 3.5, marcia_sul_posto: 3.5, bici: 7.5, cyclette: 6.8, ellittica: 5.0,
  vogatore: 7.0, nuoto: 6.0, salto_corda: 11.0, calcio: 7.0, calcetto: 7.0, padel: 6.0, tennis: 7.3, basket: 6.5,
  pallavolo: 4.0, arrampicata: 7.5, yoga: 2.5, pilates: 3.0,
};

// Timed days: circuit work, pauses, warm-up, cool-down / stretching. Normal (sets) days: resistance training.
export const TIMED_MET = { work: 5.0, rest: 2.0, warm: 3.5, cool: 2.3 };
export const SETS_MET = 3.5;
const MAX_MIN = 240;                                    // a session left open longer counts as 4 h at most

function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) {
    const [x1, y1] = table[k];
    if (x <= x1) {
      const [x0, y0] = table[k - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/** MET of an activity; kmh (optional) refines running, walking and cycling. */
export function activityMet(ex, kmh = null) {
  const slug = String(ex?.id ?? '').replace(/^lib_/, '');
  const table = BY_SPEED[slug];
  if (table && kmh > 0 && kmh < 80) return interp(table, kmh);
  return ACT_MET[slug] ?? (ex?.kind === 'cardio' ? 7.0 : 6.0);
}

/** Profile (synced in settings.profile): { sex: 'm'|'f', born: year, cm, life: 'sit'|'stand'|'active' }. */
export const profileOf = (doc) => doc.settings?.profile ?? {};

/** Mifflin-St Jeor basal (kcal/day) at `year`; null when sex, birth year, height or weight is missing. */
export function bmr(p, kg, year) {
  if (!p || (p.sex !== 'm' && p.sex !== 'f') || !(p.born > 1900) || !(p.cm > 0) || !(kg > 0)) return null;
  return 10 * kg + 6.25 * p.cm - 5 * (year - p.born) + (p.sex === 'm' ? 5 : -161);
}

/** Body weight for day d: the latest entry up to d, else the first one ever; undefined with no entries. */
export function weightFor(doc, d) {
  const kg = bodyWeightAt(doc, d);
  if (kg !== undefined) return kg;
  const first = Object.keys(doc.body).filter((k) => doc.body[k].kg != null).sort()[0];
  return first ? doc.body[first].kg : undefined;
}

/** Resting rate of day d: { perMin (kcal/min), bmr (kcal/day or null), f (daily-life factor) }; null without weight. */
export function restRate(doc, d) {
  const kg = weightFor(doc, d);
  if (!(kg > 0)) return null;
  const p = profileOf(doc);
  const b = bmr(p, kg, +d.slice(0, 4));
  return { perMin: b != null ? b / 1440 : (3.5 * kg) / 200, bmr: b, f: LIFE[p.life]?.f ?? LIFE.sit.f };
}

/** MET-minutes and minutes of a concluded session: activity (by speed), timed day (by step, scaled on the exercises
 *  done) or sets day (wall-clock time). */
export function sessionLoad(doc, s) {
  const it = s.items[0];
  const ex = s.tpl == null && s.items.length === 1 ? resolveExercise(doc, it.ex) : null;
  if (ex && (ex.kind === 'cardio' || ex.kind === 'sport')) {
    const set = it.sets[0] ?? {};
    const sec = set.sec ?? (s.end - s.start) / 1000;
    const min = Math.min(MAX_MIN, Math.max(0, sec / 60));
    const met = activityMet(ex, set.km > 0 && sec > 0 ? set.km / (sec / 3600) : null);
    return { metMin: met * min, min };
  }
  const t = s.mode === 'timer' ? doc.templates.find((x) => x.id === s.tpl) : null;
  if (t) {
    const sets = s.items.flatMap((x) => x.sets);
    const frac = sets.length ? sets.filter((x) => x.done).length / sets.length : 0;
    const { metMin, min } = timedLoad(t);
    return { metMin: metMin * frac, min: min * frac };
  }
  const min = Math.min(MAX_MIN, Math.max(0, (s.end - s.start) / 60000));
  return { metMin: SETS_MET * min, min };
}

/** MET-minutes and minutes of a whole timed day, step by step. */
function timedLoad(t) {
  let metMin = 0;
  let min = 0;
  for (const x of timerSteps(t)) {
    const met = x.type === 'rest' ? TIMED_MET.rest : x.part === 'main' ? TIMED_MET.work : TIMED_MET[x.part] ?? TIMED_MET.work;
    metMin += (met * x.sec) / 60;
    min += x.sec / 60;
  }
  return { metMin, min };
}

/** Expected kcal of a day of a scheda done on day d (timed: its steps; sets: its estimated minutes); null without
 *  weight or minutes. */
export function templateKcal(doc, t, d) {
  const r = restRate(doc, d);
  if (!r) return null;
  const metMin = isTimed(t) ? timedLoad(t).metMin : SETS_MET * estimateMinutes(doc, t, doc.settings.rest);
  return metMin > 0 ? metMin * r.perMin : null;
}

/** kcal of a concluded session: { kcal (burned in it), extra (above the daily-life rate) }; null without weight. */
export function sessionKcal(doc, s) {
  const r = restRate(doc, s.date);
  if (!r || !isConcluded(s)) return null;
  const { metMin, min } = sessionLoad(doc, s);
  const kcal = metMin * r.perMin;
  return { kcal, extra: Math.max(0, kcal - min * r.perMin * r.f) };
}

/** Day d: { bmr, life, extra, total, kcal (burned in workouts), n }, whole kcal with total = sum of the three parts
 *  (as shown); null without a complete profile and weight. */
export function dayKcal(doc, d) {
  const r = restRate(doc, d);
  if (!r || r.bmr == null) return null;
  let extra = 0;
  let kcal = 0;
  let n = 0;
  for (const s of doc.sessions) {
    if (s.date !== d || !isConcluded(s)) continue;
    const k = sessionKcal(doc, s);
    extra += k.extra;
    kcal += k.kcal;
    n++;
  }
  const [b, life, ex] = [r.bmr, r.bmr * (r.f - 1), extra].map(Math.round);
  return { bmr: b, life, extra: ex, total: b + life + ex, kcal, n };
}
