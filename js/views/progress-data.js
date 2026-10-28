// DOM-free aggregation for the Progressi, exercise detail and Corpo views.
import { addDays, addMonths, weekStart, monthEnd, fromKey, isConcluded } from '../logic.js';
import { resolveExercise } from '../library.js';
import { sessionVolume, groupSets, exerciseHistory, records, sessionExerciseStats, pace } from '../metrics.js';
import { fmtKg, fmtNum, fmtDuration, fmtShort, fmtDay, cap, MONTHS, DAY_SHORT } from '../ui.js';

export const PERIODS = [['settimana', 'Settimana'], ['mese', 'Mese'], ['6mesi', '6 mesi'], ['anno', 'Anno']];

/** Eleven distinguishable hues (hex only: charts accept #rrggbb), one per muscle group in GROUPS order. */
export const GROUP_COLORS = ['#16a34a', '#6366f1', '#14b8a6', '#f43f5e', '#f59e0b', '#0ea5e9', '#a855f7', '#f97316',
  '#84cc16', '#ec4899', '#64748b'];

export const MEASURES = [['vita', 'Vita'], ['fianchi', 'Fianchi'], ['petto', 'Petto'], ['braccio', 'Braccio'],
  ['coscia', 'Coscia'], ['polpaccio', 'Polpaccio']];

const isWork = (s) => !s.w && s.done !== false;
const round1 = (x) => Math.round(x * 10) / 10;

// ---- Periods -----------------------------------------------------------

const dm = (key) => `${+key.slice(8)} ${MONTHS[+key.slice(5, 7) - 1].toLowerCase()}`;
const monthYear = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

/** Complete calendar period containing anchor (same rules as Habits): week (7 days), month (days),
 *  6 months (weeks, ending with the anchor's month), year (12 months).
 *  Returns { from, to, title, buckets: [{ from, to, label, tip }] }; the axis always covers the whole period. */
export function periodRange(kind, anchor) {
  let from;
  let to;
  let raw;
  if (kind === 'settimana') {
    from = weekStart(anchor);
    to = addDays(from, 6);
    raw = Array.from({ length: 7 }, (_, i) => ({ from: addDays(from, i), to: addDays(from, i) }));
  } else if (kind === 'mese') {
    from = `${anchor.slice(0, 8)}01`;
    to = monthEnd(anchor);
    raw = [];
    for (let k = from; k <= to; k = addDays(k, 1)) raw.push({ from: k, to: k });
  } else if (kind === '6mesi') {
    from = addMonths(anchor, -5);
    to = monthEnd(anchor);
    raw = [];
    for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
      raw.push({ from: w < from ? from : w, to: addDays(w, 6) > to ? to : addDays(w, 6) });
    }
  } else {
    from = `${anchor.slice(0, 4)}-01-01`;
    to = `${anchor.slice(0, 4)}-12-31`;
    raw = Array.from({ length: 12 }, (_, i) => ({ from: addMonths(from, i), to: monthEnd(addMonths(from, i)) }));
  }
  let lastMonth = -1;
  const buckets = raw.map((b, i) => {
    const day = +b.from.slice(8);
    const month = +b.to.slice(5, 7) - 1;
    if (kind === 'settimana') return { ...b, label: DAY_SHORT[i], tip: fmtDay(b.from) };
    if (kind === 'mese') return { ...b, label: [1, 8, 15, 22, 29].includes(day) ? String(day) : '', tip: fmtDay(b.from) };
    if (kind === '6mesi') {
      const label = month !== lastMonth ? MONTHS[month] : '';
      lastMonth = month;
      return { ...b, label, tip: `Settimana dal ${fmtShort(b.from)}` };
    }
    return { ...b, label: MONTHS[i], tip: `${MONTHS[i]} ${b.from.slice(0, 4)}` };
  });
  const title = kind === 'settimana' ? `${dm(from)} – ${dm(to)}`
    : kind === 'mese' ? cap(monthYear.format(fromKey(from)))
      : kind === '6mesi' ? `${MONTHS[+from.slice(5, 7) - 1]} – ${MONTHS[+to.slice(5, 7) - 1]} ${to.slice(0, 4)}`
        : from.slice(0, 4);
  return { from, to, title, buckets };
}

/** Anchor of the previous (dir = -1) or next (+1) period of the same kind. */
export function shiftPeriod(kind, anchor, dir) {
  if (kind === 'settimana') return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir * ({ mese: 1, '6mesi': 6 }[kind] ?? 12));
}

export const concludedSessions = (doc) => doc.sessions.filter(isConcluded);

// ---- Per-bucket statistics ---------------------------------------------

/** Per bucket (days after today stay empty): n sessions, volume, sets per group, average minutes, average RPE, cardio { exId: { km, pkm, psec } }. */
export function bucketStats(doc, buckets, today) {
  const out = buckets.map((b) => ({ ...b, n: 0, volume: 0, groups: {}, minutes: null, rpe: null, cardio: {}, _m: [], _r: [] }));
  for (const s of concludedSessions(doc)) {
    if (s.date > today) continue;
    const b = out.find((x) => s.date >= x.from && s.date <= x.to);
    if (!b) continue;
    b.n++;
    b.volume += sessionVolume(doc, s);
    for (const [g, v] of Object.entries(groupSets(doc, [s]))) b.groups[g] = (b.groups[g] ?? 0) + v;
    if (s.end > s.start) b._m.push((s.end - s.start) / 60000);
    if (s.rpe != null) b._r.push(s.rpe);
    for (const id of new Set(s.items.map((it) => it.ex))) {
      if (resolveExercise(doc, id)?.kind !== 'cardio') continue;
      const st = sessionExerciseStats(doc, s, id);
      if (!(st.km > 0)) continue;
      const c = (b.cardio[id] ??= { km: 0, pkm: 0, psec: 0 });
      c.km += st.km;
      c.pkm += st.pkm;
      c.psec += st.psec;
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
  const seen = new Set();
  return exerciseHistory(doc, exId).filter(({ session }) => !seen.has(session) && seen.add(session)).map(({ session }) => {
    const st = sessionExerciseStats(doc, session, exId);
    const sets = session.items.filter((it) => it.ex === exId).flatMap((it) => it.sets.filter(isWork));
    return {
      id: session.id, date: session.date, text: sets.map((s) => setText(ex, s)).join(' · '),
      e1rm: st.e1rm, maxKg: st.maxKg, maxReps: st.maxReps, maxSec: st.maxSec,
      volume: Math.round(st.volume ?? 0), km: Math.round(st.km * 100) / 100, sec: st.sec,
      pace: st.pkm ? st.psec / st.pkm : null,
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
