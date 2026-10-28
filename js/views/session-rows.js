// Live workout rows: field model per exercise kind, value stepping / parsing, set-row and exercise-card HTML.
// No DOM access, no storage (testable in Node).
import { resolveExercise } from '../library.js';
import { exerciseHistory, suggestSets, pace } from '../metrics.js';
import { esc, fmtKg, fmtDuration, parseNum } from '../ui.js';

// ---- Fields -----------------------------------------------------------------

// key = set property; dur / int map to sec / rpe for cardio and sport.
export const FIELDS = {
  kg: { key: 'kg', unit: 'kg', mode: 'decimal', label: 'Chilogrammi' },
  reps: { key: 'reps', unit: 'rip', mode: 'decimal', label: 'Ripetizioni' },
  sec: { key: 'sec', unit: 's', mode: 'decimal', label: 'Secondi' },
  km: { key: 'km', unit: 'km', mode: 'decimal', label: 'Chilometri' },
  dur: { key: 'sec', unit: 'durata', mode: 'text', label: 'Durata', wide: true },   // text: mm:ss needs ':'
  int: { key: 'rpe', unit: 'intensità', mode: 'decimal', label: 'Intensità' },
};

/** 'weight' | 'reps' (body by reps) | 'time' (body by time) | 'cardio' | 'sport'. */
export function shapeOf(ex) {
  if (!ex) return 'weight';
  if (ex.kind === 'body') return ex.measure === 'time' ? 'time' : 'reps';
  return ex.kind === 'cardio' || ex.kind === 'sport' ? ex.kind : 'weight';
}

export const isStrength = (shape) => shape === 'weight' || shape === 'reps' || shape === 'time';

/** Field names shown for an item; body exercises show kg (ballast) only when a set carries it. */
export function fieldsFor(shape, item) {
  const ballast = item.sets.some((s) => s.kg != null);
  if (shape === 'weight') return ['kg', 'reps'];
  if (shape === 'reps') return ballast ? ['kg', 'reps'] : ['reps'];
  if (shape === 'time') return ballast ? ['kg', 'sec'] : ['sec'];
  if (shape === 'cardio') return ['km', 'dur'];
  return ['dur', 'int'];
}

const round2 = (x) => Math.round(x * 100) / 100;

/** Step of a field: kg from settings, reps 1, seconds 5, km 0.1, cardio / sport duration 1 min, intensity 1. */
export function stepOf(field, kgStep) {
  return { kg: kgStep, reps: 1, sec: 5, km: 0.1, dur: 60, int: 1 }[field];
}

/** Value after one tap on − (dir -1) or + (dir 1); never below 0, intensity within 1–10. */
export function stepValue(field, value, dir, kgStep) {
  if (value == null && dir < 0) return null;
  let v = round2((value ?? 0) + dir * stepOf(field, kgStep));
  if (field === 'int') v = Math.min(10, Math.max(1, v));
  return Math.max(0, v);
}

const DEC = /^\d+([.,]\d+)?$/;

/** "20" = minutes, "m:ss", "h:mm:ss" to seconds; NaN when invalid. */
export function parseDuration(text) {
  const v = text.trim();
  if (DEC.test(v)) return Math.round(parseNum(v) * 60);
  if (/^\d+:[0-5]?\d$/.test(v)) {
    const [m, s] = v.split(':').map(Number);
    return m * 60 + s;
  }
  if (/^\d+:[0-5]\d:[0-5]\d$/.test(v)) {
    const [h, m, s] = v.split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }
  return NaN;
}

/** Typed text to a value: null when empty, undefined when invalid (keep the old value). */
export function parseField(field, text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (field === 'dur') {
    const s = parseDuration(t);
    return Number.isFinite(s) ? s : undefined;
  }
  if (field === 'sec' && t.includes(':')) {
    const s = parseDuration(t);
    return Number.isFinite(s) ? s : undefined;
  }
  if (!DEC.test(t)) return undefined;
  const n = parseNum(t);
  if (field === 'kg' || field === 'km') return round2(n);
  if (field === 'int') return Math.min(10, Math.max(1, Math.round(n)));
  return Math.round(n);
}

/** Value as shown in the field. */
export function fmtField(field, v) {
  if (v == null) return '';
  if (field === 'kg' || field === 'km') return fmtKg(v);
  if (field === 'dur') return fmtDuration(v);
  return String(v);
}

// ---- Session structure ---------------------------------------------------------

/** Superset labels A1, A2, B1…: runs of 2+ consecutive items with the same non-null group; '' otherwise. */
export function groupLabels(items) {
  const out = items.map(() => '');
  let letter = 0;
  for (let i = 0; i < items.length;) {
    const g = items[i].group;
    let b = i;
    if (g != null) while (b + 1 < items.length && items[b + 1].group === g) b++;
    if (b > i) {
      const L = String.fromCharCode(65 + (letter++ % 26));
      for (let k = i; k <= b; k++) out[k] = `${L}${k - i + 1}`;
    }
    i = b + 1;
  }
  return out;
}

/** First and last index of the run of consecutive items sharing item i's group. */
function runOf(items, i) {
  const g = items[i].group;
  let a = i;
  let b = i;
  if (g != null) {
    while (a > 0 && items[a - 1].group === g) a--;
    while (b + 1 < items.length && items[b + 1].group === g) b++;
  }
  return [a, b];
}

/**
 * Rest (s) to start after ticking set j of item i; 0 = none.
 * Strength only; in a superset only after the last item of the group that has a set in that round.
 */
export function restAfter(doc, session, i, j) {
  const items = session.items;
  if (!isStrength(shapeOf(resolveExercise(doc, items[i].ex)))) return 0;
  const [a, b] = runOf(items, i);
  let last = i;
  for (let k = a; k <= b; k++) if (items[k].sets[j]) last = k;
  if (last !== i) return 0;
  for (let k = b; k >= a; k--) if (items[k].rest != null) return items[k].rest;
  return doc.settings.rest;
}

/** The session's exercise list or set counts differ from the template's. */
export function structureChanged(tpl, session) {
  if (!tpl) return false;
  if (tpl.items.length !== session.items.length) return true;
  return tpl.items.some((it, i) => it.ex !== session.items[i].ex || it.sets.length !== session.items[i].sets.length);
}

/** Working-set progress: { done, total } (warm-ups excluded). */
export function setCounts(session) {
  let done = 0;
  let total = 0;
  for (const it of session.items) {
    for (const s of it.sets) {
      if (s.w) continue;
      total++;
      if (s.done) done++;
    }
  }
  return { done, total };
}

const toSessionSet = (s) => ({
  w: !!s.w, kg: s.kg ?? null, reps: s.reps ?? null, sec: s.sec ?? null, km: s.km ?? null,
  rpe: null, done: false, ...(s.tag ? { tag: s.tag } : {}),
});

/** Sets for an exercise added during the workout: last session's progression, else `count` defaults per kind. */
export function newSets(doc, exId, count = 3) {
  const sug = suggestSets(doc, exId, null, doc.settings.kgStep);
  if (sug.length) return sug.map(toSessionSet);
  const shape = shapeOf(resolveExercise(doc, exId));
  if (shape === 'cardio' || shape === 'sport') return [toSessionSet({})];
  const base = { weight: { reps: 8 }, reps: { reps: 10 }, time: { sec: 30 } }[shape];
  return Array.from({ length: Math.max(1, count) }, () => toSessionSet(base));
}

/** Duration as "52 min" or "1 h 05 min". */
export function fmtMinutes(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** A new set appended to an item: copy of the last working set, not done. */
export function nextSet(item, warm = false) {
  const work = item.sets.filter((s) => !s.w);
  const warmSrc = warm ? item.sets.find((s) => s.w) : null;
  const src = warmSrc ?? work[work.length - 1] ?? item.sets[item.sets.length - 1] ?? {};
  const out = toSessionSet(src);
  delete out.tag;
  out.w = warm;
  if (warm && !warmSrc) out.kg = null;            // a warm-up is lighter: no load copied from a working set
  return out;
}

/** Index where a new warm-up goes: after the existing warm-ups at the start. */
export function warmIndex(item) {
  let at = 0;
  while (at < item.sets.length && item.sets[at].w) at++;
  return at;
}

// ---- Previous values ----------------------------------------------------------

/** Sets of exId in the latest concluded session before `session` (by start); null if none. */
export function lastSets(doc, session, exId) {
  const hist = exerciseHistory(doc, exId).filter((h) => h.session.id !== session.id && h.session.start < session.start);
  return hist.length ? hist[hist.length - 1].item.sets : null;
}

/** Previous set matching set j: same position among warm-ups or among working sets. */
export function prevSet(prev, sets, j) {
  if (!prev) return null;
  const w = !!sets[j].w;
  const k = sets.slice(0, j).filter((s) => !!s.w === w).length;
  const p = prev.filter((s) => !!s.w === w)[k];
  return p && p.done !== false ? p : null;
}

/** Previous values as muted text, e.g. "60 × 8", "+10 kg × 12", "5 km · 25:00". */
export function prevText(shape, p) {
  const kg = p.kg != null ? fmtKg(p.kg) : null;
  if (shape === 'weight') {
    if (kg != null && p.reps != null) return `${kg} × ${p.reps}`;
    return kg != null ? `${kg} kg` : p.reps != null ? `${p.reps} rip` : '';
  }
  if (shape === 'reps' || shape === 'time') {
    const v = shape === 'time' ? (p.sec != null ? `${p.sec} s` : '') : (p.reps != null ? `${p.reps} rip` : '');
    return kg != null && p.kg ? `+${kg} kg × ${v}` : v;
  }
  if (shape === 'cardio') {
    return [p.km != null ? `${fmtKg(p.km)} km` : '', p.sec ? fmtDuration(p.sec) : ''].filter(Boolean).join(' · ');
  }
  return [p.sec ? fmtDuration(p.sec) : '', p.rpe != null ? `intensità ${p.rpe}` : ''].filter(Boolean).join(' · ');
}

// ---- HTML ------------------------------------------------------------------------

/**
 * View context for the builders:
 * { doc, s (session), ro (read-only), prev: Map exId -> sets|null, notes: Set of item indexes with the note open }.
 */
export function viewContext(doc, s, ro, notes) {
  const prev = new Map();
  for (const it of s.items) if (!prev.has(it.ex)) prev.set(it.ex, lastSets(doc, s, it.ex));
  return { doc, s, ro, prev, notes };
}

const shapeAt = (c, i) => shapeOf(resolveExercise(c.doc, c.s.items[i].ex));

/** Muted line of a set row: previous values, suggestion tag, RPE, pace. */
export function infoHtml(c, i, j) {
  const it = c.s.items[i];
  const set = it.sets[j];
  const shape = shapeAt(c, i);
  const p = prevSet(c.prev.get(it.ex), it.sets, j);
  const text = p ? prevText(shape, p) : '';
  const out = [`<span class="prev"><span class="sr-only">Ultima volta: </span>${text ? esc(text) : '–'}</span>`];
  if (set.tag) out.push(`<span class="tag">↑ ${esc(set.tag)}</span>`);
  if (set.rpe != null && shape !== 'sport') out.push(`<span>RPE ${esc(set.rpe)}</span>`);
  if (shape === 'cardio' && set.km > 0 && set.sec > 0) out.push(`<span>${esc(pace(set.sec, set.km))}/km</span>`);
  return out.join('');
}

function stepper(c, field, value, who) {
  const f = FIELDS[field];
  const dis = c.ro ? 'disabled' : '';
  return `<div class="stepper" data-f="${field}">
    <button type="button" data-act="dec" aria-label="Diminuisci ${f.label.toLowerCase()}" ${dis}>−</button>
    <label class="val${f.wide ? ' wide' : ''}"><input type="text" inputmode="${f.mode}" data-act="val" value="${esc(fmtField(field, value))}"
      placeholder="–" autocomplete="off" enterkeyhint="done" aria-label="${f.label}, ${who}" ${dis}><small>${f.unit}</small></label>
    <button type="button" data-act="inc" aria-label="Aumenta ${f.label.toLowerCase()}" ${dis}>+</button>
  </div>`;
}

/** One set: line 1 = label, previous values, tag, check; line 2 (or same line when wide) = steppers. */
export function rowHtml(c, i, j) {
  const it = c.s.items[i];
  const set = it.sets[j];
  const shape = shapeAt(c, i);
  const n = it.sets.slice(0, j + 1).filter((s) => !s.w).length;
  const who = set.w ? 'riscaldamento' : `serie ${n}`;
  const fields = fieldsFor(shape, it).map((f) => stepper(c, f, set[FIELDS[f].key], who)).join('');
  return `<div class="set-row${set.done ? ' done' : ''}" data-j="${j}">
    <button type="button" class="set-head" data-act="set" aria-haspopup="dialog"><span class="sr-only">Opzioni ${who}. </span>
      <span class="lbl${set.w ? ' warm' : ''}" aria-hidden="true"${set.w ? ' title="Riscaldamento"' : ''}>${set.w ? 'R' : n}</span>
      <span class="info">${infoHtml(c, i, j)}</span></button>
    <div class="fields">${fields}</div>
    <button type="button" class="check${set.done ? ' on' : ''}" data-act="done" aria-pressed="${!!set.done}"
      aria-label="${set.w ? 'Riscaldamento' : `Serie ${n}`} fatta" ${c.ro ? 'disabled' : ''}>✓</button>
  </div>`;
}

/** Exercise card: label (A1…), name, menu, note, set rows, add-set buttons. */
export function cardHtml(c, i, label) {
  const it = c.s.items[i];
  const ex = resolveExercise(c.doc, it.ex);
  const shape = shapeOf(ex);
  const dis = c.ro ? 'disabled' : '';
  const showNote = it.note || c.notes.has(i);
  return `<section class="card ex-card${label ? ' grouped' : ''}" data-i="${i}">
    <div class="ex-head">${label ? `<span class="tag" title="Superserie">${label}</span>` : ''}
      <h2>${esc(ex?.name ?? 'Esercizio rimosso')}</h2>
      <button type="button" class="icon-btn small" data-act="menu" aria-haspopup="dialog" aria-label="Opzioni ${esc(ex?.name ?? 'esercizio')}">⋯</button></div>
    ${showNote ? `<input type="text" class="ex-note" data-act="note" maxlength="120" value="${esc(it.note)}" placeholder="Nota"
      aria-label="Nota esercizio" autocomplete="off" ${dis}>` : ''}
    <div class="sets">${it.sets.map((_, j) => rowHtml(c, i, j)).join('') || '<p class="muted">Nessuna serie.</p>'}</div>
    <div class="btn-row ex-foot"><button type="button" class="btn small" data-act="addset" ${dis}>+ Serie</button>
      ${isStrength(shape) ? `<button type="button" class="btn small" data-act="addwarm" ${dis}>+ Riscaldamento</button>` : ''}</div>
  </section>`;
}
