// DOM-free aggregation for the Progressi, exercise detail and Corpo views.
import { addDays, addMonths, weekStart, isConcluded } from '../logic.js';
import { resolveExercise } from '../library.js';
import { sessionVolume, groupSets, exerciseHistory, records, setVolume, bodyWeightAt, e1rm, pace } from '../metrics.js';
import { fmtKg, fmtNum, fmtDuration, fmtShort, MONTHS } from '../ui.js';

export const PERIODS = [['settimana', 'Settimana'], ['mese', 'Mese'], ['6mesi', '6 mesi'], ['anno', 'Anno']];

/** Eleven distinguishable hues (hex only: charts accept #rrggbb), one per muscle group in GROUPS order. */
export const GROUP_COLORS = ['#16a34a', '#6366f1', '#14b8a6', '#f43f5e', '#f59e0b', '#0ea5e9', '#a855f7', '#f97316',
  '#84cc16', '#ec4899', '#64748b'];

export const MEASURES = [['vita', 'Vita'], ['fianchi', 'Fianchi'], ['petto', 'Petto'], ['braccio', 'Braccio'],
  ['coscia', 'Coscia'], ['polpaccio', 'Polpaccio']];

const isWork = (s) => !s.w && s.done !== false;
const round1 = (x) => Math.round(x * 10) / 10;

// ---- Periods -----------------------------------------------------------

const weeks = (today, n) => Array.from({ length: n }, (_, i) => {
  const from = addDays(weekStart(today), -7 * (n - 1 - i));
  return { from, to: addDays(from, 6) };
});

/** Rolling window ending with the current week/month; the axis is always complete (buckets without data stay empty).
 *  Returns { title, buckets: [{ from, to, label, tip }] }. */
export function periodRange(kind, today) {
  let buckets;
  let title;
  if (kind === 'mese') {
    buckets = Array.from({ length: 12 }, (_, i) => {
      const from = addMonths(today, i - 11);
      const m = +from.slice(5, 7) - 1;
      return { from, to: addDays(addMonths(from, 1), -1), label: MONTHS[m], tip: `${MONTHS[m]} ${from.slice(0, 4)}` };
    });
    title = 'Ultimi 12 mesi';
  } else {
    const n = { settimana: 12, '6mesi': 26, anno: 52 }[kind] ?? 12;
    let lastMonth = -1;
    buckets = weeks(today, n).map((b) => {
      const m = +b.to.slice(5, 7) - 1;
      const label = kind === 'settimana' ? fmtShort(b.from) : (m !== lastMonth ? MONTHS[m] : '');
      lastMonth = m;
      return { ...b, label, tip: `Settimana dal ${fmtShort(b.from)}` };
    });
    if (kind === 'settimana') buckets = buckets.map((b, i) => ({ ...b, label: (11 - i) % 3 === 0 ? b.label : '' }));
    title = { settimana: 'Ultime 12 settimane', '6mesi': 'Ultime 26 settimane', anno: 'Ultime 52 settimane' }[kind] ?? '';
  }
  return { title, buckets };
}

export const concludedSessions = (doc) => doc.sessions.filter(isConcluded);

// ---- Per-bucket statistics ---------------------------------------------

/** Per bucket: n sessions, volume, sets per group, average minutes, average RPE, cardio { exId: { km, pkm, psec } }. */
export function bucketStats(doc, buckets) {
  const out = buckets.map((b) => ({ ...b, n: 0, volume: 0, groups: {}, minutes: null, rpe: null, cardio: {}, _m: [], _r: [] }));
  for (const s of concludedSessions(doc)) {
    const b = out.find((x) => s.date >= x.from && s.date <= x.to);
    if (!b) continue;
    b.n++;
    b.volume += sessionVolume(doc, s);
    for (const [g, v] of Object.entries(groupSets(doc, [s]))) b.groups[g] = (b.groups[g] ?? 0) + v;
    if (s.end > s.start) b._m.push((s.end - s.start) / 60000);
    if (s.rpe != null) b._r.push(s.rpe);
    for (const it of s.items) {
      if (resolveExercise(doc, it.ex)?.kind !== 'cardio') continue;
      const c = (b.cardio[it.ex] ??= { km: 0, pkm: 0, psec: 0 });
      for (const set of it.sets) {
        if (!isWork(set) || !(set.km > 0)) continue;
        c.km += set.km;
        if (set.km >= 1 && set.sec > 0) {
          c.pkm += set.km;
          c.psec += set.sec;
        }
      }
    }
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  for (const b of out) {
    b.volume = Math.round(b.volume);
    b.minutes = avg(b._m) == null ? null : Math.round(avg(b._m));
    b.rpe = avg(b._r) == null ? null : round1(avg(b._r));
    delete b._m;
    delete b._r;
  }
  return out;
}

/** Cardio exercises by total km, most first: [{ id, km }]. */
export function cardioTotals(stats) {
  const tot = {};
  for (const b of stats) for (const [id, c] of Object.entries(b.cardio)) tot[id] = (tot[id] ?? 0) + c.km;
  return Object.entries(tot).filter(([, km]) => km > 0).sort((a, b) => b[1] - a[1]).map(([id, km]) => ({ id, km }));
}

/** Sets per group over a week (Monday-based), as body map levels input. */
export function weekGroupSets(doc, weekFrom) {
  const to = addDays(weekFrom, 6);
  return groupSets(doc, concludedSessions(doc).filter((s) => s.date >= weekFrom && s.date <= to));
}

/** date -> list of session names (template name or "Allenamento libero"), for the annual calendar. */
export function sessionNames(doc) {
  const map = {};
  for (const s of concludedSessions(doc)) {
    const name = s.tpl ? (doc.templates.find((t) => t.id === s.tpl)?.name ?? 'Scheda rimossa') : 'Allenamento libero';
    (map[s.date] ??= []).push(name);
  }
  return map;
}

/** One-line current best of an exercise, by kind. */
export function recordSummary(doc, exId) {
  const ex = resolveExercise(doc, exId);
  const r = records(doc, exId);
  if (!ex) return '';
  if (ex.kind === 'weight') {
    return [r.maxKg != null ? `${fmtKg(r.maxKg)} kg max` : null, r.e1rm != null ? `1RM ${fmtKg(r.e1rm)} kg` : null]
      .filter(Boolean).join(' · ');
  }
  if (ex.kind === 'body') {
    return ex.measure === 'time' ? (r.maxSec != null ? `${fmtNum(r.maxSec)} s max` : '')
      : [r.maxReps != null ? `${fmtNum(r.maxReps)} rip max` : null, r.e1rm != null ? `1RM ${fmtKg(r.e1rm)} kg` : null]
        .filter(Boolean).join(' · ');
  }
  if (ex.kind === 'cardio') {
    return [r.maxKm != null ? `${fmtNum(r.maxKm)} km max` : null, r.bestPace != null ? `${pace(r.bestPace, 1)}/km` : null]
      .filter(Boolean).join(' · ');
  }
  return r.maxSec != null ? `${fmtDuration(r.maxSec)} max` : '';
}

/** Exercises trained in [from, to], last trained first: [{ id, last }]. */
export function trainedIn(doc, from, to) {
  const last = {};
  for (const s of concludedSessions(doc)) {
    if (s.date < from || s.date > to) continue;
    for (const it of s.items) if (!last[it.ex] || s.date > last[it.ex]) last[it.ex] = s.date;
  }
  return Object.entries(last).sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)).map(([id, d]) => ({ id, last: d }));
}

// ---- Exercise detail ----------------------------------------------------

function setText(ex, s) {
  if (ex.kind === 'weight') return `${s.kg != null ? fmtKg(s.kg) : '–'}×${s.reps ?? '–'}`;
  if (ex.kind === 'body') {
    const base = ex.measure === 'time' ? `${s.sec ?? '–'} s` : `${s.reps ?? '–'}`;
    return s.kg ? `${base} (+${fmtKg(s.kg)} kg)` : base;
  }
  if (ex.kind === 'cardio') return `${s.km != null ? fmtNum(s.km) : '–'} km${s.sec ? ` · ${fmtDuration(s.sec)}` : ''}`;
  return s.sec ? fmtDuration(s.sec) : '–';
}

/** Per concluded session containing the exercise, oldest first: maxima, volume, distance, pace, sets text. */
export function exerciseSeries(doc, exId) {
  const ex = resolveExercise(doc, exId);
  if (!ex) return [];
  return exerciseHistory(doc, exId).map(({ session, item }) => {
    const bw = bodyWeightAt(doc, session.date);
    const sets = item.sets.filter(isWork);
    const max = (f) => sets.reduce((m, s) => { const v = f(s); return v != null && (m == null || v > m) ? v : m; }, null);
    const km = sets.reduce((a, s) => a + (s.km || 0), 0);
    const sec = sets.reduce((a, s) => a + (s.sec || 0), 0);
    const kmPace = sets.filter((s) => s.km >= 1 && s.sec > 0);
    const volume = sets.reduce((a, s) => a + (setVolume(ex, s, bw) ?? 0), 0);
    const load = (s) => (ex.kind === 'weight' ? s.kg ?? null : bw === undefined ? null : bw + (s.kg || 0));
    return {
      id: session.id, date: session.date, text: sets.map((s) => setText(ex, s)).join(' · '),
      e1rm: ex.kind === 'weight' || ex.kind === 'body' ? max((s) => e1rm(load(s), s.reps)) : null,
      maxKg: ex.kind === 'weight' ? max((s) => s.kg ?? null) : null,
      maxReps: max((s) => s.reps ?? null), maxSec: max((s) => s.sec ?? null),
      volume: Math.round(volume), km: Math.round(km * 100) / 100, sec,
      pace: kmPace.length ? kmPace.reduce((a, s) => a + s.sec, 0) / kmPace.reduce((a, s) => a + s.km, 0) : null,
    };
  });
}

// ---- Body ----------------------------------------------------------------

/** Entries with at least one value (an entry reduced to { t } is empty), oldest first: [{ date, kg, ...measures }]. */
export function bodyEntries(doc) {
  return Object.keys(doc.body).sort().map((date) => ({ date, ...doc.body[date] }))
    .filter((e) => e.kg != null || MEASURES.some(([k]) => e[k] != null));
}

/** Mean of the weights in [date - 6, date] for each entry with a weight; list: [{ date, kg }] oldest first. */
export function movingAverage(list) {
  return list.map((e) => {
    const from = addDays(e.date, -6);
    const win = list.filter((x) => x.date >= from && x.date <= e.date);
    return { date: e.date, value: round1(win.reduce((a, x) => a + x.kg, 0) / win.length) };
  });
}

/** Chart points with an x label only on every k-th point (counted from the newest), so dates never overlap. */
export function dated(list, valueOf, labelOf) {
  const n = list.length;
  const k = n <= 6 ? 1 : n <= 12 ? 2 : Math.ceil(n / 6);
  return list.map((e, i) => ({ label: (n - 1 - i) % k === 0 ? labelOf(e) : '', tip: labelOf(e, true), value: valueOf(e) }));
}
