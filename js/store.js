// Persistence: the only module that touches localStorage.
// Emits 'change' (detail { kind, id }) after data mutations and 'sync' when sync status or the banner changes.
import {
  emptyDoc, newId, todayKey, fromKey, isScheda, isDate, lastSessionOf,
} from './logic.js';
import { validateDoc, mergeDocs } from './merge.js';
import { SyncError, connect, syncOnce } from './sync.js';
import { safeColor } from './ui.js';

const KEY = 'fitness.v1';
const SYNC_KEY = 'fitness.sync';
const bus = new EventTarget();
let doc = emptyDoc();
let notice = '';          // banner message
let readOnly = false;

let syncCfg = null;       // { token, gistId, salt, iterations, key, at }
let sync = { state: 'off', message: '', at: 0 };   // off | idle | syncing | offline | error
let syncTimer = 0;
let syncing = false;
let syncAgain = false;

/** Give every live, non-archived template a scheda and every scheda a start date (idempotent). True when anything changed. A template is loose when
 *  its scheda is missing, deleted, or does not list it in seq: if that scheda is live it is appended to its seq (keeping
 *  its dayName), else it is wrapped in a one-day scheda. Archived templates stay loose.
 *  The new scheda id derives from the template id, so devices migrating the same data converge on the same program; when
 *  that (non-deleted) program already holds the template it is re-attached. updatedAt values are never bumped (the new program
 *  inherits the template's), so a migration cannot win a merge over a real edit. */
function migrateSchede(d) {
  let changed = false;
  for (const tpl of d.templates) {
    if (tpl.deleted || tpl.archived) continue;
    const own = tpl.scheda ? d.programs.find((p) => p.id === tpl.scheda) : null;
    if (own && !own.deleted && own.seq?.includes(tpl.id)) continue;
    if (own && isScheda(own) && Array.isArray(own.seq)) {             // orphan of a live scheda: back into its rotation
      own.seq.push(tpl.id);
      if (!tpl.dayName) {
        const used = new Set(d.templates.filter((t) => t.scheda === own.id && !t.deleted).map((t) => t.dayName));
        let n = own.seq.length;
        while (used.has(`Giorno ${n}`)) n++;
        tpl.dayName = `Giorno ${n}`;
      }
      changed = true;
      continue;
    }
    let id = `p_${String(tpl.id).replace(/^t_/, '')}`;
    const same = d.programs.find((p) => p.id === id);
    if (same && !same.deleted && same.seq?.includes(tpl.id)) {
      tpl.scheda = id;
      if (!tpl.dayName) tpl.dayName = 'Giorno 1';
      changed = true;
      continue;
    }
    if (same) id = newId('p_');
    d.programs.push({
      id, name: String(tpl.name ?? '').trim().slice(0, 40) || 'Scheda', kind: 'rotation', emoji: tpl.emoji ?? '💪',
      color: tpl.color ?? '#2f8f4a', weeks: [], seq: [tpl.id], from: todayKey(), to: null, deleted: false,
      updatedAt: tpl.updatedAt ?? 0,
    });
    tpl.scheda = id;
    if (!tpl.dayName) tpl.dayName = 'Giorno 1';
    changed = true;
  }
  for (const p of d.programs) {                    // period model: every scheda has a start (older ones were "not activated")
    if (!isScheda(p) || p.from != null) continue;
    p.from = todayKey();
    changed = true;
  }
  return changed;
}

/** migrateSchede on the live document; malformed elements leave it as it is. */
function migrate() {
  try {
    return migrateSchede(doc);
  } catch {
    return false;
  }
}

export function load() {
  let migrated = false;
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    readOnly = true;
    notice = 'Memoria del browser non disponibile: i dati non verranno salvati.';
    return;
  }
  try {
    syncCfg = JSON.parse(localStorage.getItem(SYNC_KEY));
  } catch {
    syncCfg = null;
  }
  if (syncCfg) sync = { state: 'idle', message: '', at: syncCfg.at || 0 };
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (!validateDoc(d)) throw new Error('invalid');
    d.settings = { ...emptyDoc().settings, ...d.settings };
    doc = d;
    migrated = true;
  } catch {
    try {
      localStorage.setItem(KEY + '.corrupt', raw);
      notice = 'I dati salvati erano danneggiati: ne ho conservato una copia e sono ripartito da zero. Puoi importare un backup.';
    } catch {
      readOnly = true;                            // the original must never be overwritten without a copy
      notice = 'I dati salvati sono danneggiati e non sono riuscito a conservarne una copia: per non perderli, i nuovi dati non verranno salvati.';
    }
  }
  if (!migrated) return;
  if (migrate()) save('migrate');                 // saved only when something changed
}

export const getDoc = () => doc;
export const getNotice = () => notice;
export const isReadOnly = () => readOnly;
export const onChange = (fn) => bus.addEventListener('change', fn);
export const onSync = (fn) => bus.addEventListener('sync', fn);

const emit = (type = 'change', detail = {}) => bus.dispatchEvent(new CustomEvent(type, { detail }));

const SYNC_NOTICE = 'Sincronizzazione:';

export function clearNotice() {
  if (readOnly) return;                           // the read-only banner stays
  notice = '';
  emit('sync');
}

/** Write to storage and notify views, without scheduling a sync. */
function persist(kind = 'import', id = null) {
  if (!readOnly) {
    try {
      localStorage.setItem(KEY, JSON.stringify(doc));
    } catch {
      readOnly = true;                            // §10: storage full -> persistent banner, read-only
      notice = 'Spazio esaurito: impossibile salvare. Esporta un backup.';
    }
  }
  emit('change', { kind, id });
}

/** User change: persist and upload a few seconds later. */
function save(kind, id = null) {
  persist(kind, id);
  scheduleSync();
}

const now = () => Date.now();
const find = (list, id) => list.find((o) => o.id === id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const nextOrder = (list) => Math.max(-1, ...list.filter((o) => !o.deleted).map((o) => o.order ?? 0)) + 1;

// ---- Exercises -----------------------------------------------------------

/** Create an own exercise, or update it when fields.id exists. Returns the id. */
export function saveExercise(fields) {
  if (readOnly) return null;
  fields = 'name' in fields ? { ...fields, name: String(fields.name ?? '').trim().slice(0, 40) } : fields;
  const ex = fields.id ? find(doc.exercises, fields.id) : null;
  if (ex) {
    Object.assign(ex, fields, { updatedAt: now() });
    save('exercise', ex.id);
    return ex.id;
  }
  const id = newId('x_');
  doc.exercises.push({
    group: null, also: [], ...fields, id, deleted: false, updatedAt: now(),
  });
  save('exercise', id);
  return id;
}

/** Rename / hide a library exercise (stored as an edit, keyed by its lib_ id). */
export function editLibraryExercise(id, patch) {
  if (readOnly) return;
  const prev = doc.exerciseEdits[id] ?? {};
  const edit = { ...prev, t: now() };
  if ('name' in patch) edit.name = patch.name;
  if ('hidden' in patch) edit.hidden = !!patch.hidden;
  doc.exerciseEdits[id] = edit;
  save('exercise', id);
}

export function deleteExercise(id) {
  if (readOnly) return;
  const ex = find(doc.exercises, id);
  if (!ex) return;
  ex.deleted = true;
  ex.updatedAt = now();
  save('exercise', id);
}

// ---- Templates -----------------------------------------------------------

/** Create (no id) or update a template; returns the id. */
export function saveTemplate(t) {
  if (readOnly) return null;
  const fields = { ...clone(t), name: String(t.name ?? '').trim().slice(0, 40) };
  const cur = t.id ? find(doc.templates, t.id) : null;
  if (cur) {
    Object.assign(cur, fields, { updatedAt: now() });
    save('template', cur.id);
    return cur.id;
  }
  const id = newId('t_');
  doc.templates.push({
    emoji: '💪', color: '#2f8f4a', items: [], ...fields, id, order: nextOrder(doc.templates),
    archived: false, deleted: false, updatedAt: now(),
  });
  save('template', id);
  return id;
}

export function deleteTemplate(id) {
  if (readOnly) return;
  const t = find(doc.templates, id);
  if (!t) return;
  t.deleted = true;
  t.updatedAt = now();
  save('template', id);
}

export function archiveTemplate(id, on) {
  if (readOnly) return;
  const t = find(doc.templates, id);
  if (!t) return;
  t.archived = !!on;
  t.updatedAt = now();
  save('template', id);
}

/** Swap with the neighbour in the active list (dir = -1 up, +1 down). */
export function moveTemplate(id, dir) {
  if (readOnly) return;
  const list = doc.templates.filter((t) => !t.archived && !t.deleted).sort((a, b) => a.order - b.order);
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  list.forEach((t, k) => { t.order = k; });       // normalise ties after merges
  [list[i].order, list[j].order] = [j, i];
  list[i].updatedAt = list[j].updatedAt = now();
  save('template', id);
}

export function duplicateTemplate(id) {
  if (readOnly) return null;
  const t = find(doc.templates, id);
  if (!t) return null;
  const copy = {
    ...clone(t),
    id: newId('t_'),
    name: `${t.name} (copia)`.slice(0, 40),
    order: nextOrder(doc.templates),
    archived: false,
    deleted: false,
    updatedAt: now(),
  };
  doc.templates.push(copy);
  save('template', copy.id);
  return copy.id;
}

// ---- Schede ----------------------------------------------------------------
// A scheda is a rotation program; its days are templates with { scheda, dayName }, ordered by program.seq.

const cleanText = (v, max = 40) => String(v ?? '').trim().slice(0, max);
const liveScheda = (id) => doc.programs.find((p) => p.id === id && isScheda(p)) ?? null;
/** "Scheda · Giorno" within 60 characters: the scheda part is cut first, the day name stays whole. */
function dayLabel(p, dayName) {
  const tail = ` · ${dayName}`;
  return p.name.slice(0, Math.max(0, 60 - tail.length)) + tail;
}

/** Default name of the next day of scheda `schedaId`: the first "Giorno n" from its next position not used by a live day. */
export function nextDayName(schedaId) {
  const p = liveScheda(schedaId);
  const used = new Set(doc.templates.filter((t) => t.scheda === schedaId && !t.deleted).map((t) => t.dayName));
  let n = (p?.seq?.length ?? 0) + 1;           // next position first, then the next free number
  while (used.has(`Giorno ${n}`)) n++;
  return `Giorno ${n}`;
}

/** Create (no id) or update a scheda: name, emoji, color (#rrggbb), from (start date, default today), to (end date or null;
 *  an end before the start is dropped). Returns the id; an id that is deleted or not a scheda changes nothing and returns null. */
export function saveScheda(f) {
  if (readOnly) return null;
  const fields = {};
  if ('name' in f) fields.name = cleanText(f.name) || 'Scheda';
  if ('emoji' in f) fields.emoji = f.emoji;
  if ('color' in f) fields.color = safeColor(f.color);
  if ('from' in f) fields.from = isDate(f.from) ? f.from : todayKey();
  if ('to' in f) fields.to = isDate(f.to) ? f.to : null;
  if (f.id) {
    const cur = liveScheda(f.id);
    if (!cur) return null;
    if ('from' in fields && !('to' in fields) && cur.to != null && cur.to < fields.from) fields.to = null;
    const look = ({ name, emoji, color }) => [name, emoji, color].join('\n');
    const before = look(cur);
    Object.assign(cur, fields, { updatedAt: now() });
    if (cur.to != null && cur.to < cur.from) cur.to = null;
    if (look(cur) !== before) {                    // days follow the scheda's name and look, only when they changed
      for (const t of doc.templates) {
        if (t.scheda !== cur.id || t.deleted) continue;
        t.emoji = cur.emoji;
        t.color = cur.color;
        t.name = dayLabel(cur, t.dayName ?? '');
        t.updatedAt = cur.updatedAt;
      }
    }
    save('program', cur.id);
    return cur.id;
  }
  const id = newId('p_');
  doc.programs.push({
    name: 'Scheda', emoji: '💪', color: '#2f8f4a', from: todayKey(), to: null, ...fields,
    id, kind: 'rotation', weeks: [], seq: [], deleted: false, updatedAt: now(),
  });
  const made = doc.programs[doc.programs.length - 1];
  if (made.to != null && made.to < made.from) made.to = null;
  save('program', id);
  return id;
}

/** Append a day (template) to the scheda's rotation; dayName defaults to "Giorno n". Returns the template id. */
export function addSchedaDay(schedaId, { dayName, items = [] } = {}) {
  if (readOnly) return null;
  const p = liveScheda(schedaId);
  if (!p) return null;
  const name = cleanText(dayName) || nextDayName(p.id);
  const id = newId('t_');
  const t = now();
  doc.templates.push({
    emoji: p.emoji ?? '💪', color: p.color ?? '#2f8f4a', items: clone(items), name: dayLabel(p, name), scheda: p.id, dayName: name,
    id, order: nextOrder(doc.templates), archived: false, deleted: false, updatedAt: t,
  });
  p.seq.push(id);
  p.updatedAt = t;
  save('program', p.id);
  return id;
}

/** Update a day's name and / or exercises. */
export function saveSchedaDay(tplId, { dayName, items } = {}) {
  if (readOnly) return;
  const t = find(doc.templates, tplId);
  if (!t) return;
  if (cleanText(dayName)) t.dayName = cleanText(dayName);
  if (items !== undefined) t.items = clone(items);
  const p = find(doc.programs, t.scheda);
  if (p) t.name = dayLabel(p, t.dayName ?? '');
  t.updatedAt = now();
  save('template', tplId);
}

/** Swap the day with its neighbour in the scheda's order (dir = -1 up, +1 down). */
export function moveSchedaDay(tplId, dir) {
  if (readOnly || (dir !== 1 && dir !== -1)) return;
  const p = find(doc.programs, find(doc.templates, tplId)?.scheda);
  if (!p) return;
  const i = p.seq.indexOf(tplId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.seq.length) return;
  [p.seq[i], p.seq[j]] = [p.seq[j], p.seq[i]];
  p.updatedAt = now();
  save('program', p.id);
}

/** Copy of a day, placed right after it. Returns the new template id. */
export function duplicateSchedaDay(tplId) {
  if (readOnly) return null;
  const t = find(doc.templates, tplId);
  const p = t ? liveScheda(t.scheda) : null;
  if (!p) return null;
  const dayName = cleanText(`${t.dayName ?? t.name} (copia)`);
  const copy = {
    ...clone(t), id: newId('t_'), dayName, name: dayLabel(p, dayName), order: nextOrder(doc.templates),
    archived: false, deleted: false, updatedAt: now(),
  };
  doc.templates.push(copy);
  const i = p.seq.indexOf(tplId);
  p.seq.splice(i < 0 ? p.seq.length : i + 1, 0, copy.id);
  p.updatedAt = copy.updatedAt;
  save('program', p.id);
  return copy.id;
}

/** Soft delete a day and drop it from its scheda's order (also the last one: the scheda then plans nothing). */
export function deleteSchedaDay(tplId) {
  if (readOnly) return;
  const t = find(doc.templates, tplId);
  if (!t) return;
  const ts = now();
  t.deleted = true;
  t.updatedAt = ts;
  const p = find(doc.programs, t.scheda);
  if (p) {
    p.seq = p.seq.filter((id) => id !== tplId);
    p.updatedAt = ts;
  }
  save('program', p ? p.id : null);
}

/** Soft delete a scheda and all its days (sessions stay). */
export function deleteScheda(id) {
  if (readOnly) return;
  const p = find(doc.programs, id);
  if (!p) return;
  const ts = now();
  p.deleted = true;
  p.updatedAt = ts;
  for (const t of doc.templates) {
    if (t.scheda !== id) continue;
    t.deleted = true;
    t.updatedAt = ts;
  }
  save('program', id);
}

// ---- Sessions --------------------------------------------------------------

const liveTemplate = (id) => (id ? doc.templates.find((t) => t.id === id && !t.deleted) ?? null : null);

/** Session set from a template target: reps = the (single) target, kg / sec / km as planned. */
const targetSet = (s) => ({
  w: !!s.w, kg: s.kg ?? null, reps: s.reps?.[0] ?? null, sec: s.sec ?? null, km: s.km ?? null,
});

/** Session items from a day template. Each set starts from what was done the last time this same day was trained
 *  (same exercise, same set position, done sets only); otherwise from the template's targets. Other days and schede
 *  are never looked at. */
function buildItems(tpl, done) {
  if (!tpl) return [];
  const last = lastSessionOf(doc, tpl.id);
  const used = new Set();
  return tpl.items.map((item, i) => {
    let prev = last?.items[i]?.ex === item.ex && !used.has(i) ? i : -1;
    if (prev < 0) prev = last ? last.items.findIndex((o, k) => o.ex === item.ex && !used.has(k)) : -1;
    if (prev >= 0) used.add(prev);
    const before = prev >= 0 ? last.items[prev].sets : [];
    const out = {
      ex: item.ex,
      group: item.group ?? null,
      note: item.note ?? '',
      sets: item.sets.map((t, j) => {
        const b = before[j];
        const v = b?.done && !!b.w === !!t.w
          ? { w: !!t.w, kg: b.kg ?? null, reps: b.reps ?? null, sec: b.sec ?? null, km: b.km ?? null }
          : targetSet(t);
        return { ...v, rpe: null, done };
      }),
    };
    if (item.rest != null) out.rest = item.rest;
    return out;
  });
}

/** New open session. Returns the id. */
export function startSession({ date = todayKey(), tpl = null } = {}) {
  if (readOnly) return null;
  const t = liveTemplate(tpl);
  const id = newId('s_');
  const ts = now();
  doc.sessions.push({
    id, date, start: ts, end: null, tpl: t ? t.id : null, rot: null, rpe: null, note: '',
    deleted: false, updatedAt: ts, items: buildItems(t, false),
  });
  save('session', id);
  return id;
}

/** Most recently started open session, or null. */
export function openSessionId() {
  let best = null;
  for (const s of doc.sessions) {
    if (!s.deleted && s.end == null && (!best || s.start > best.start)) best = s;
  }
  return best ? best.id : null;
}

/** mutator(session) edits in place; stamped and saved. */
export function updateSession(id, mutator) {
  if (readOnly) return;
  const s = find(doc.sessions, id);
  if (!s) return;
  mutator(s);
  s.updatedAt = now();
  save('session', id);
}

/** Rewrite the template from the session: keep existing targets where position and exercise match. */
function templateFromSession(tpl, s) {
  tpl.items = s.items.map((it, i) => {
    const old = tpl.items[i]?.ex === it.ex ? tpl.items[i] : tpl.items.find((o) => o.ex === it.ex);
    const sets = it.sets.map((set, j) => {
      if (old?.sets[j]) return old.sets[j];
      const out = {};
      if (set.w) out.w = true;
      if (set.reps != null) out.reps = [set.reps, set.reps];
      if (set.kg != null) out.kg = set.kg;
      if (set.sec != null) out.sec = set.sec;
      if (set.km != null) out.km = set.km;
      return out;
    });
    const item = { ex: it.ex, group: it.group ?? null, note: it.note ?? old?.note ?? '', sets };
    const rest = old?.rest ?? it.rest;
    if (rest != null) item.rest = rest;
    return item;
  });
  tpl.updatedAt = now();
}

export function finishSession(id, { rpe = null, note = '', updateTemplate = false } = {}) {
  if (readOnly) return;
  const s = find(doc.sessions, id);
  if (!s || s.deleted || s.end != null) return;
  s.end = now();
  s.rpe = rpe;
  s.note = note;
  s.updatedAt = s.end;
  const tpl = updateTemplate ? liveTemplate(s.tpl) : null;
  if (tpl) templateFromSession(tpl, s);
  save('session', id);
}

/** Soft delete. */
export function discardSession(id) {
  if (readOnly) return;
  const s = find(doc.sessions, id);
  if (!s) return;
  s.deleted = true;
  s.updatedAt = now();
  save('session', id);
}

/** Past workout entered by hand: starts at 12:00 of the day, lasts `minutes`; sets are marked done. */
export function addPastSession({ date, tpl = null, minutes = 60 }) {
  if (readOnly) return null;
  const t = liveTemplate(tpl);
  const d = fromKey(date);
  d.setHours(12, 0, 0, 0);
  const start = d.getTime();
  const id = newId('s_');
  doc.sessions.push({
    id, date, start, end: start + minutes * 60000, tpl: t ? t.id : null, rot: null, rpe: null, note: '',
    deleted: false, updatedAt: now(), items: buildItems(t, true),
  });
  save('session', id);
  return id;
}

// ---- Body ----------------------------------------------------------------

/** Merge fields into the day's entry; null / undefined / NaN removes a field (an entry with only t is empty). */
export function setBody(d, patch) {
  if (readOnly) return;
  const e = { ...doc.body[d] };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || Number.isNaN(v)) delete e[k];
    else e[k] = v;
  }
  doc.body[d] = { ...e, t: now() };
  save('body', d);
}

// ---- Settings ------------------------------------------------------------

export function setSetting(k, v) {
  if (readOnly) return;
  doc.settings[k] = v;
  persist('settings', k);                         // device-local: nothing to upload
}

// ---- Backup ------------------------------------------------------------

/** Share sheet on touch devices (iPhone: "Salva in File"), download elsewhere. False if cancelled. */
export async function exportBackup() {
  const name = `fitness-backup-${todayKey()}.json`;
  const file = new File([JSON.stringify(doc, null, 2)], name, { type: 'application/json' });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  doc.settings.lastBackup = now();
  persist('settings', 'lastBackup');
  return true;
}

/** Any failure (not JSON, wrong shape, malformed elements) throws 'Backup non valido.' and changes nothing. */
export async function importBackup(file) {
  if (readOnly) throw new Error('Memoria non disponibile: impossibile importare.');
  let r;
  try {
    const data = JSON.parse(await file.text());
    if (!validateDoc(data)) throw new Error('invalid');
    r = mergeDocs(doc, data);
  } catch {
    throw new Error('Backup non valido.');
  }
  doc = r.doc;
  migrate();
  save('import');
  return { count: r.count };
}

// ---- Sync --------------------------------------------------------------

export const getSync = () => ({ connected: !!syncCfg, ...sync });

function setSync(state, message = '', at = sync.at) {
  sync = { state, message, at };
  emit('sync');
}

function storeSyncCfg() {
  try {
    if (syncCfg) localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg));
    else localStorage.removeItem(SYNC_KEY);
  } catch { /* config lives in memory for this session */ }
}

/** Merge the synced doc onto the current state, keeping anything edited during the round trip (newest wins). */
function adopt(merged) {
  let r;
  try {
    r = mergeDocs(doc, merged);
  } catch {
    throw new SyncError('format', 'Dati sincronizzati non validi.');
  }
  if (r.count) {
    doc = r.doc;
    const migrated = migrate();
    persist('sync');
    if (migrated) scheduleSync();                 // the new schede reach the other devices
  }
}

/** Throws SyncError (wrong password, bad token, offline...). */
export async function connectSync(token, password) {
  if (readOnly) throw new Error('Memoria non disponibile: impossibile collegare la sincronizzazione.');
  const r = await connect({ token: token.trim(), password, local: doc });
  syncCfg = { ...r.cfg, at: now() };
  storeSyncCfg();
  adopt(r.doc);
  setSync('idle', '', syncCfg.at);
}

export function disconnectSync() {
  clearTimeout(syncTimer);
  syncTimer = 0;
  syncCfg = null;
  storeSyncCfg();
  setSync('off');
}

export function scheduleSync(delay = 3000) {
  if (!syncCfg) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

/** Upload a pending change right away (the app is going to the background). */
export function flushSync() {
  if (syncTimer) runSync();
}

export async function runSync() {
  clearTimeout(syncTimer);
  syncTimer = 0;
  if (!syncCfg || readOnly) return;               // read-only: nothing could be saved after the merge
  if (syncing) {
    syncAgain = true;
    return;
  }
  if (!navigator.onLine) {
    setSync('offline', 'Offline: sincronizzo appena torna la rete.');
    return;
  }
  syncing = true;
  setSync('syncing');
  try {
    const r = await syncOnce({ cfg: syncCfg, local: doc });
    if (!syncCfg) return;                         // disconnected meanwhile
    adopt(r.doc);
    syncCfg.at = now();
    storeSyncCfg();
    if (notice.startsWith(SYNC_NOTICE)) notice = '';   // an earlier failure is resolved
    setSync('idle', '', syncCfg.at);
  } catch (e) {
    if (e instanceof SyncError && e.code === 'network') {
      setSync('offline', e.message);
    } else {
      if (!notice || notice.startsWith(SYNC_NOTICE)) notice = `${SYNC_NOTICE} ${e.message || 'errore imprevisto.'}`;
      setSync('error', e.message || 'Errore imprevisto.');
    }
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(500);
    }
  }
}
