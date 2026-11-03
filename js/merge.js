// Document validation and merge (backup import and sync). Pure: no DOM, storage or network.

const ARRAYS = ['exercises', 'templates', 'programs', 'sessions'];
const MAPS = ['exerciseEdits', 'plan', 'body'];
const DATE_KEYED = new Set(['plan', 'body']);   // keys must be YYYY-MM-DD (they reach the UI)
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const clone = (o) => JSON.parse(JSON.stringify(o));
const keepKey = (map, k) => !DATE_KEYED.has(map) || DATE_KEY.test(k);

/** Profile with only known fields in range: sex m/f, birth year, height (cm), typical day, t. */
export function cleanProfile(p) {
  const out = { t: Number.isFinite(p.t) ? p.t : 0 };
  if (p.sex === 'm' || p.sex === 'f') out.sex = p.sex;
  if (Number.isInteger(p.born) && p.born >= 1900 && p.born <= 2100) out.born = p.born;
  if (Number.isFinite(p.cm) && p.cm >= 80 && p.cm <= 250) out.cm = p.cm;
  if (['sit', 'stand', 'active'].includes(p.life)) out.life = p.life;
  return out;
}

/** True when d is a version-1 fitness document with all eight fields of the right type. */
export function validateDoc(d) {
  if (!isObj(d) || d.version !== 1) return false;
  return ARRAYS.every((k) => Array.isArray(d[k]))
    && MAPS.every((k) => isObj(d[k]))
    && isObj(d.settings);
}

/** Merge incoming into a copy of local: newest updatedAt (arrays) / t (maps) wins, ties keep local.
 *  Incoming plan/body keys that are not dates (e.g. '__proto__') are dropped. */
export function mergeDocs(local, incoming) {
  const doc = clone(local);
  let count = 0;
  for (const key of ARRAYS) {
    const index = new Map(doc[key].map((o, i) => [o.id, i]));
    for (const o of incoming[key]) {
      const i = index.get(o.id);
      if (i === undefined) {
        index.set(o.id, doc[key].push(clone(o)) - 1);
        count++;
      } else if ((o.updatedAt ?? 0) > (doc[key][i].updatedAt ?? 0)) {
        doc[key][i] = clone(o);
        count++;
      }
    }
  }
  for (const key of MAPS) {
    for (const [k, v] of Object.entries(incoming[key])) {
      if (!keepKey(key, k) || !isObj(v)) continue;
      if (!Object.hasOwn(doc[key], k) || (v.t ?? 0) > (doc[key][k].t ?? 0)) {
        doc[key][k] = clone(v);
        count++;
      }
    }
  }
  doc.settings.lastBackup = Math.max(doc.settings.lastBackup || 0, incoming.settings.lastBackup || 0);
  const p = incoming.settings.profile;
  if (isObj(p) && (p.t ?? 0) > (doc.settings.profile?.t ?? 0)) {   // the profile (calories) syncs as one record
    doc.settings.profile = cleanProfile(p);
    count++;
  }
  return { doc, count };
}
