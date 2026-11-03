// Pure logic: dates, schede, last workout of a day, weekly streaks.
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

/** Valid 'YYYY-MM-DD' calendar key. */
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toKey(fromKey(s)) === s;

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
    settings: { theme: 'auto', kgStep: 2.5, rest: 90, sound: true, loud: false, lastBackup: 0 },
  };
}

// ---- Sessions ----------------------------------------------------------

export const isConcluded = (s) => s.end != null && !s.deleted;

const concluded = (doc) => doc.sessions.filter(isConcluded);

/** Number of concluded sessions on day d. */
export const doneCount = (doc, d) => concluded(doc).filter((s) => s.date === d).length;

// ---- Schede ------------------------------------------------------------
// A scheda is a rotation program: name, look, days (templates ordered by seq), period from..to (to optional).
// Several schede may run at the same time; the user picks the day each time.

/** A day can be trained: live, not archived, with at least one exercise. */
export const usable = (doc, id) => doc.templates.some((t) => t.id === id && !t.archived && !t.deleted && t.items?.length > 0);

export const isScheda = (p) => !!p && !p.deleted && p.kind === 'rotation';

/** Live days (templates) of a scheda, in order. */
export const schedaDays = (doc, p) => p.seq.map((id) => doc.templates.find((t) => t.id === id)).filter((t) => t && !t.deleted);

/** Day d is inside the scheda's period. */
export const isRunning = (p, d) => p.from != null && p.from <= d && (p.to == null || d <= p.to);

export const isConcludedScheda = (p, today) => p.to != null && p.to < today;

/** { running, upcoming, concluded }: in progress today (latest start first), starting later, ended (newest first). */
export function schedaGroups(doc, today) {
  const all = doc.programs.filter(isScheda);
  const running = all.filter((p) => isRunning(p, today)).sort((a, b) => b.from.localeCompare(a.from) || a.name.localeCompare(b.name, 'it'));
  const concluded = all.filter((p) => isConcludedScheda(p, today)).sort((a, b) => b.to.localeCompare(a.to));
  const upcoming = all.filter((p) => !running.includes(p) && !concluded.includes(p))
    .sort((a, b) => (a.from ?? '').localeCompare(b.from ?? '') || a.name.localeCompare(b.name, 'it'));
  return { running, upcoming, concluded };
}

/** Days one can choose: { groups: [{ p, days }] (running schede first, then the upcoming ones; concluded ones only with
 *  `withConcluded`, for past workouts), loose: live templates without scheda }. Only usable days are listed. */
export function choosableDays(doc, today, { withConcluded = false } = {}) {
  const { running, upcoming, concluded } = schedaGroups(doc, today);
  const groups = [...running, ...upcoming, ...(withConcluded ? concluded : [])]
    .map((p) => ({ p, days: schedaDays(doc, p).filter((t) => usable(doc, t.id)) }));
  const loose = doc.templates.filter((t) => !t.deleted && !t.archived && !schedaOf(doc, t.id)).sort((a, b) => a.order - b.order);
  return { groups, loose };
}

/** All templates of choosableDays in display order. */
export const choosableList = (doc, today, opts) => {
  const { groups, loose } = choosableDays(doc, today, opts);
  return [...groups.flatMap((g) => g.days), ...loose];
};

/** Scheda (program) a day template belongs to, also when deleted (history keeps its name); null if none. */
export function schedaOf(doc, tplId) {
  const sid = doc.templates.find((t) => t.id === tplId)?.scheda;
  return (sid && doc.programs.find((p) => p.id === sid)) || null;
}

/** "Scheda · Giorno"; the template name when it is not part of a scheda; "Allenamento libero" without template. */
export function workoutLabel(doc, tplId) {
  const t = tplId == null ? null : doc.templates.find((x) => x.id === tplId);
  if (!t) return 'Allenamento libero';
  const p = schedaOf(doc, tplId);
  return p ? `${p.name} · ${t.dayName ?? t.name}` : t.name;
}

/** Latest concluded session of day template tplId (by start), optionally other than session `except`; null if none. */
export function lastSessionOf(doc, tplId, except = null) {
  let last = null;
  for (const s of concluded(doc)) {
    if (s.tpl !== tplId || s.id === except) continue;
    if (!last || s.start > last.start) last = s;
  }
  return last;
}

/** Day (template id) of the scheda trained most recently, or null. */
export function lastDayOf(doc, p) {
  let last = null;
  for (const s of concluded(doc)) {
    if (!p.seq.includes(s.tpl)) continue;
    if (!last || s.start > last.start) last = s;
  }
  return last ? last.tpl : null;
}

// ---- Streaks -------------------------------------------------------------

/** Weeks in a row with at least one workout: { current, best }; the running week does not break the streak. */
export function weekStreaks(doc, today) {
  const dates = concluded(doc).map((s) => s.date).filter((d) => d <= today);
  if (!dates.length) return { current: 0, best: 0 };
  const weeks = new Set(dates.map(weekStart));
  const thisWeek = weekStart(today);
  let best = 0;
  let run = 0;
  for (let w = weekStart(dates.reduce((a, b) => (a < b ? a : b))); w <= thisWeek; w = addDays(w, 7)) {
    if (weeks.has(w)) best = Math.max(best, ++run);
    else if (w !== thisWeek) run = 0;
  }
  let current = 0;
  for (let w = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7); weeks.has(w); w = addDays(w, -7)) current++;
  return { current, best };
}
