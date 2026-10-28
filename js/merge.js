// Document validation and merge (backup import and sync). Pure: no DOM, storage or network.

const ARRAYS = ['exercises', 'templates', 'programs', 'sessions'];
const MAPS = ['exerciseEdits', 'plan', 'body'];
const DATE_KEYED = new Set(['plan', 'body']);   // keys must be YYYY-MM-DD (they reach the UI)
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const clone = (o) => JSON.parse(JSON.stringify(o));
const keepKey = (map, k) => !DATE_KEYED.has(map) || DATE_KEY.test(k);

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
  return { doc, count };
}
