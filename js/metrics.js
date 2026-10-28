// Workout metrics: volume, sets per group, e1RM, records, suggested progression, pace, duration.
// Pure functions. No DOM, no storage.

import { isConcluded } from './logic.js';
import { resolveExercise } from './library.js';

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const isWork = (set) => !set.w && set.done !== false;

/** Body weight on day d: kg of the latest body entry with date <= d; undefined if none. */
export function bodyWeightAt(doc, d) {
  let best;
  for (const k of Object.keys(doc.body)) {
    if (k <= d && doc.body[k].kg != null && (best === undefined || k > best)) best = k;
  }
  return best === undefined ? undefined : doc.body[best].kg;
}

/** Load of a set: kg (weight) or body weight + kg (body, if body weight known); null otherwise. */
function loadOf(ex, set, bw) {
  if (ex.kind === 'weight') return set.kg ?? null;
  if (ex.kind === 'body') return bw === undefined ? null : bw + (set.kg || 0);
  return null;
}

/** Volume of a done, non-warm-up set; null when it has none (§6.6). */
export function setVolume(ex, set, bw) {
  if (!ex || !isWork(set)) return null;
  if (ex.kind === 'weight') return set.reps == null ? null : round2((set.kg || 0) * set.reps);
  if (ex.kind === 'body' && ex.measure !== 'time') {
    const load = loadOf(ex, set, bw);
    return load === null || set.reps == null ? null : round2(load * set.reps);
  }
  return null;
}

function itemVolume(doc, it, bw) {
  const ex = resolveExercise(doc, it.ex);
  let v = 0;
  for (const set of it.sets) v += setVolume(ex, set, bw) ?? 0;
  return v;
}

export function sessionVolume(doc, s) {
  const bw = bodyWeightAt(doc, s.date);
  let v = 0;
  for (const it of s.items) v += itemVolume(doc, it, bw);
  return round2(v);
}

/** Sets per muscle group over sessions: +1 primary, +0.5 each secondary (§6.7). */
export function groupSets(doc, sessions) {
  const out = {};
  for (const s of sessions) {
    for (const it of s.items) {
      const ex = resolveExercise(doc, it.ex);
      if (!ex || (ex.kind !== 'weight' && ex.kind !== 'body')) continue;
      const n = it.sets.filter(isWork).length;
      if (!n) continue;
      out[ex.group] = (out[ex.group] ?? 0) + n;
      for (const g of ex.also ?? []) out[g] = (out[g] ?? 0) + n * 0.5;
    }
  }
  return out;
}

/** Body map level: 0, <5, <10, <15, >=15 sets. */
export function bodyMapLevel(n) {
  if (n <= 0) return 0;
  if (n < 5) return 1;
  if (n < 10) return 2;
  if (n < 15) return 3;
  return 4;
}

/** Epley estimated 1RM, 1 decimal; null for reps outside 1..12 or unknown load. */
export function e1rm(load, reps) {
  if (load == null || reps == null || reps < 1 || reps > 12) return null;
  return round1(reps === 1 ? load : load * (1 + reps / 30));
}

const concluded = (doc) => doc.sessions.filter(isConcluded);

/** Concluded sessions containing exId, by start: [{ session, item }]. */
export function exerciseHistory(doc, exId) {
  const out = [];
  for (const session of concluded(doc).sort((a, b) => a.start - b.start)) {
    for (const item of session.items) if (item.ex === exId) out.push({ session, item });
  }
  return out;
}

const REP_RANGE = Array.from({ length: 12 }, (_, i) => i + 1);

function emptyRecords() {
  return {
    maxKg: null, e1rm: null, volume: null, repMax: Object.fromEntries(REP_RANGE.map((r) => [r, null])),
    maxReps: null, maxSec: null, maxKm: null, bestPace: null,
  };
}

const raise = (rec, key, v) => {
  if (v != null && (rec[key] === null || v > rec[key])) rec[key] = v;
};

/** Records of exercise exId over the given sessions. */
function recordsOver(doc, exId, sessions) {
  const ex = resolveExercise(doc, exId);
  const rec = emptyRecords();
  if (!ex) return rec;
  for (const s of sessions) {
    const bw = bodyWeightAt(doc, s.date);
    let vol = 0;
    for (const it of s.items) {
      if (it.ex !== exId) continue;
      vol += itemVolume(doc, it, bw);
      for (const set of it.sets) {
        if (!isWork(set)) continue;
        const load = loadOf(ex, set, bw);
        if (ex.kind === 'weight') {
          raise(rec, 'maxKg', set.kg ?? null);
          for (const r of REP_RANGE) if (set.reps >= r && set.kg != null) raise(rec.repMax, r, set.kg);
        }
        if (ex.kind === 'weight' || ex.kind === 'body') raise(rec, 'e1rm', e1rm(load, set.reps));
        if (ex.kind === 'body' && ex.measure === 'time') raise(rec, 'maxSec', set.sec);
        if (ex.kind === 'body' && ex.measure !== 'time') raise(rec, 'maxReps', set.reps);
        if (ex.kind === 'sport') raise(rec, 'maxSec', set.sec);
        if (ex.kind === 'cardio') {
          raise(rec, 'maxKm', set.km);
          if (set.km >= 1 && set.sec > 0) {
            const p = set.sec / set.km;
            if (rec.bestPace === null || p < rec.bestPace) rec.bestPace = p;
          }
        }
      }
    }
    if (vol > 0) raise(rec, 'volume', round2(vol));
  }
  return rec;
}

/** Records over concluded sessions (only those with start < before, if given). */
export function records(doc, exId, { before } = {}) {
  const sessions = exerciseHistory(doc, exId)
    .map((h) => h.session)
    .filter((s, i, a) => a.indexOf(s) === i && (before == null || s.start < before));
  return recordsOver(doc, exId, sessions);
}

const HIGHER = ['maxKg', 'e1rm', 'volume', 'maxReps', 'maxSec', 'maxKm'];

/** Records strictly beaten by the session and exercises done for the first time (§6.8). */
export function sessionRecords(doc, session) {
  const out = { records: [], firsts: [] };
  const seen = new Set();
  for (const it of session.items) {
    if (seen.has(it.ex)) continue;
    seen.add(it.ex);
    const hasPrev = exerciseHistory(doc, it.ex).some((h) => h.session.start < session.start);
    if (!hasPrev) {
      out.firsts.push(it.ex);
      continue;
    }
    const kind = resolveExercise(doc, it.ex)?.kind;
    const now = recordsOver(doc, it.ex, [session]);
    const prev = records(doc, it.ex, { before: session.start });
    const add = (k, value, p, extra = {}) => {
      if (value != null && p != null) out.records.push({ ex: it.ex, kind: k, value, prev: p, ...extra });
    };
    for (const k of HIGHER) if (now[k] != null && prev[k] != null && now[k] > prev[k]) add(k, now[k], prev[k]);
    for (const r of REP_RANGE) {
      if (now.repMax[r] != null && prev.repMax[r] != null && now.repMax[r] > prev.repMax[r]) {
        add('repMax', now.repMax[r], prev.repMax[r], { reps: r });
      }
    }
    if (kind === 'cardio' && now.bestPace != null && prev.bestPace != null && now.bestPace < prev.bestPace) {
      add('bestPace', now.bestPace, prev.bestPace);
    }
  }
  return out;
}

/** Italian decimal comma, e.g. 2.5 -> '2,5'. */
const itNum = (n) => String(n).replace('.', ',');

/**
 * Suggested values for the sets of an exercise, one per template set (warm-ups copied).
 * Without a template item, one per working set of the last session.
 */
export function suggestSets(doc, exId, item, kgStep) {
  const ex = resolveExercise(doc, exId);
  const kind = ex?.kind ?? 'weight';
  const tSets = item?.sets ?? [];
  const hist = exerciseHistory(doc, exId);
  const lastWork = hist.length ? hist[hist.length - 1].item.sets.filter((s) => !s.w) : [];

  const fromTemplate = (s) => ({
    w: !!s.w, kg: s.kg ?? null, reps: s.reps?.[0] ?? null, sec: s.sec ?? null, km: s.km ?? null,
  });
  if (!lastWork.length) return tSets.map(fromTemplate);

  const tWork = tSets.filter((s) => !s.w);
  const lastAt = (i) => lastWork[Math.min(i, lastWork.length - 1)];
  const targetMax = (i) => tWork[i]?.reps?.[1] ?? lastAt(i).reps;
  const targetMin = (i) => tWork[i]?.reps?.[0] ?? lastAt(i).reps;
  const count = tSets.length ? tWork.length : lastWork.length;
  const hit = lastWork.every((s, i) => s.done !== false && s.reps >= targetMax(i));
  const topKg = Math.max(...lastWork.map((s) => s.kg ?? 0));

  const work = [];
  for (let i = 0; i < count; i++) {
    const l = lastAt(i);
    const out = { w: false, kg: null, reps: null, sec: l.sec ?? null, km: l.km ?? null };
    if (kind === 'weight') {
      if (hit) {
        Object.assign(out, { kg: topKg + kgStep, reps: targetMin(i), tag: `+${itNum(kgStep)} kg` });
      } else {
        out.kg = l.kg ?? null;
        out.reps = Math.min(targetMax(i), (l.reps ?? 0) + 1);
        if (out.reps > l.reps) out.tag = '+1 rip';
      }
    } else if (kind === 'body') {
      out.kg = l.kg ?? null;
      if (ex.measure === 'time') {
        out.sec = (l.sec ?? 0) + 5;
        out.tag = '+5 s';
      } else {
        out.reps = (l.reps ?? 0) + 1;
        out.tag = '+1 rip';
      }
    }
    work.push(out);
  }
  if (!tSets.length) return work;
  let n = 0;
  return tSets.map((s) => (s.w ? fromTemplate(s) : work[n++]));
}

/** Pace 'm:ss' per km. */
export function pace(sec, km) {
  const s = Math.round(sec / km);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Estimated duration of a template in minutes, rounded to 5 (§6.9). */
export function estimateMinutes(doc, template, restDefault) {
  const blocks = []; // strength groups: arrays of items; cardio/sport: { sec }
  let prevGroup = null;
  for (const it of template.items) {
    const kind = resolveExercise(doc, it.ex)?.kind;
    if (kind === 'cardio' || kind === 'sport') {
      blocks.push({ sec: it.sets.reduce((a, s) => a + (s.sec ?? 0), 0) });
      prevGroup = null;
    } else if (it.group != null && it.group === prevGroup) {
      blocks[blocks.length - 1].push(it);
    } else {
      blocks.push([it]);
      prevGroup = it.group ?? null;
    }
  }
  let total = 0;
  blocks.forEach((b, bi) => {
    if (!Array.isArray(b)) {
      total += b.sec;
      return;
    }
    const rounds = Math.max(...b.map((it) => it.sets.length));
    const rest = b[b.length - 1].rest ?? restDefault;
    for (let r = 0; r < rounds; r++) {
      total += 40 * b.filter((it) => it.sets[r]).length;
      if (!(bi === blocks.length - 1 && r === rounds - 1)) total += rest;
    }
  });
  return Math.round(total / 300) * 5;
}
