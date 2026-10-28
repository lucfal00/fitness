// Pure logic: dates, programs, planned workouts, rotation, adherence, streaks.
// No DOM, no storage. Dates are local 'YYYY-MM-DD' keys (string order = date order).

const pad = (n) => String(n).padStart(2, '0');

// ---- Dates -------------------------------------------------------------

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = (now = new Date()) => toKey(now);

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from a to b (b − a); rounding absorbs DST changes. */
export const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);

/** 1 = Monday … 7 = Sunday */
export const weekday = (key) => fromKey(key).getDay() || 7;

export const weekStart = (key) => addDays(key, 1 - weekday(key));

export const monthStart = (key) => key.slice(0, 8) + '01';

export function monthEnd(key) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Start of the month n months away from key's month. */
export function addMonths(key, n) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

function* days(from, to) {
  for (let k = from; k <= to; k = addDays(k, 1)) yield k;
}

// ---- Document ----------------------------------------------------------

/** Prefix + 6 random base36 characters. */
export function newId(prefix) {
  let s = '';
  while (s.length < 6) s += Math.floor(Math.random() * 36).toString(36);
  return prefix + s;
}

export function emptyDoc() {
  return {
    version: 1, exercises: [], exerciseEdits: {}, templates: [], programs: [], plan: {}, sessions: [], body: {},
    settings: { theme: 'auto', kgStep: 2.5, rest: 90, sound: true, lastBackup: 0 },
  };
}

// ---- Sessions ----------------------------------------------------------

export const isConcluded = (s) => s.end != null && !s.deleted;

const concluded = (doc) => doc.sessions.filter(isConcluded);

/** Number of concluded sessions on day d. */
export const doneCount = (doc, d) => concluded(doc).filter((s) => s.date === d).length;

/** A concluded session of the same template exists on day d. */
export const isPlannedDone = (doc, d, tplId) => concluded(doc).some((s) => s.date === d && s.tpl === tplId);

// ---- Programs ----------------------------------------------------------

/** Non-deleted program with from <= d <= to (or open-ended), latest from wins. */
export function activeProgram(doc, d) {
  let best = null;
  for (const p of doc.programs) {
    if (p.deleted || p.from == null || p.from > d || (p.to != null && d > p.to)) continue;
    if (!best || p.from > best.from) best = p;
  }
  return best;
}

/** Patches {id, from, to} to apply when program `id` is activated from `from` (§6.1). */
export function activationPatches(doc, id, from, to = null) {
  const patches = [];
  for (const p of doc.programs) {
    if (p.id === id || p.deleted || p.from == null) continue;
    if (p.from < from && (p.to == null || p.to >= from)) patches.push({ id: p.id, from: p.from, to: addDays(from, -1) });
    else if (p.from >= from) patches.push({ id: p.id, from: null, to: null });
  }
  patches.push({ id, from, to });
  return patches;
}

// ---- Planned workouts --------------------------------------------------

const usable = (doc, id) => doc.templates.some((t) => t.id === id && !t.archived && !t.deleted);

const usableIds = (doc, ids) => ids.filter((id) => usable(doc, id));

/** Next rotation step: last concluded rotation session's index + 1, else 0. */
export function nextRotationIndex(doc, program) {
  const len = program.seq.length;
  let last = null;
  for (const s of concluded(doc)) {
    if (s.rot?.p === program.id && (!last || s.start > last.start)) last = s;
  }
  return last && len ? (last.rot.i + 1) % len : 0;
}

/** First usable template at or after seq[idx] (cyclic), or null. */
function pickRotation(doc, seq, idx) {
  for (let k = 0; k < seq.length; k++) {
    const id = seq[(idx + k) % seq.length];
    if (usable(doc, id)) return id;
  }
  return null;
}

function plannedRotation(doc, p, d, today) {
  if (!p.days?.includes(weekday(d))) return { items: [], count: 0 };
  if (d < today) return { items: [], count: 1 };
  const n = nextRotationIndex(doc, p);
  let start = today;
  const doneToday = concluded(doc).filter((s) => s.date === today && s.rot?.p === p.id);
  if (doneToday.length) {
    if (d === today) {
      const id = pickRotation(doc, p.seq, doneToday[doneToday.length - 1].rot.i);
      return { items: id ? [id] : [], count: 1 };
    }
    start = addDays(today, 1);
  }
  let ahead = 0; // training days from start up to d (exclusive)
  for (const k of days(start, addDays(d, -1))) {
    if (doc.plan[k]?.items != null) continue;
    if (p.days.includes(weekday(k)) && activeProgram(doc, k)?.id === p.id) ahead++;
  }
  const id = p.seq.length ? pickRotation(doc, p.seq, n + ahead) : null;
  return { items: id ? [id] : [], count: 1 };
}

/** Planned workouts of day d: { items: template ids, count }. */
export function planned(doc, d, today = todayKey()) {
  const over = doc.plan[d]?.items;
  if (over != null) {
    const items = usableIds(doc, over);
    return { items, count: items.length };
  }
  const p = activeProgram(doc, d);
  if (!p) return { items: [], count: 0 };
  if (p.kind === 'week') {
    const n = p.weeks.length;
    const k = n ? (Math.floor(diffDays(weekStart(p.from), weekStart(d)) / 7) % n + n) % n : 0;
    const items = usableIds(doc, p.weeks[k]?.[weekday(d) - 1] ?? []);
    return { items, count: items.length };
  }
  if (p.kind === 'rotation') return plannedRotation(doc, p, d, today);
  return { items: [], count: 0 };
}

// ---- Adherence and streaks ---------------------------------------------

/** { prev, ok } for day d (≤ today); today is never counted as missed. */
function dayScore(doc, d, today) {
  const done = doneCount(doc, d);
  let prev = planned(doc, d, today).count;
  const ok = Math.min(prev, done);
  if (d === today) prev = ok;
  return { prev, ok };
}

/** Σ ok / Σ prev over from..to (days ≤ today); null when nothing was planned. */
export function adherence(doc, from, to, today) {
  let prev = 0;
  let ok = 0;
  for (const d of days(from, to < today ? to : today)) {
    const s = dayScore(doc, d, today);
    prev += s.prev;
    ok += s.ok;
  }
  return prev ? ok / prev : null;
}

const plans = (p) => p.kind === 'week' || (p.kind === 'rotation' && p.days != null);

/** Weeks of consecutive full completion: { current, best } (§6.5). */
export function weekStreaks(doc, today) {
  const dates = concluded(doc).map((s) => s.date);
  for (const p of doc.programs) if (!p.deleted && p.from != null) dates.push(p.from);
  if (!dates.length) return { current: 0, best: 0 };
  const thisWeek = weekStart(today);
  const status = []; // 'c' complete, 'x' failed, 'i' ignored
  for (let w = weekStart(dates.reduce((a, b) => (a < b ? a : b))); w <= thisWeek; w = addDays(w, 7)) {
    const week = [...days(w, addDays(w, 6))];
    let planning = false;
    for (const d of week) {
      const p = activeProgram(doc, d);
      if (p && plans(p)) planning = true;
    }
    let st;
    if (planning) {
      let S = 0;
      let O = 0;
      for (const d of week) {
        if (d > today) break;
        const s = dayScore(doc, d, today);
        S += s.prev;
        O += s.ok;
      }
      st = S === 0 ? 'i' : O === S ? 'c' : 'x';
    } else {
      st = week.some((d) => doneCount(doc, d) > 0) ? 'c' : 'x';
    }
    if (w === thisWeek && st === 'x') st = 'i';
    status.push(st);
  }
  let best = 0;
  let run = 0;
  for (const st of status) {
    if (st === 'c') best = Math.max(best, ++run);
    else if (st === 'x') run = 0;
  }
  let current = 0;
  for (let i = status.length - 1; i >= 0 && status[i] !== 'x'; i--) if (status[i] === 'c') current++;
  return { current, best };
}
