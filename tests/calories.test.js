import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '../js/logic.js';
import { bmr, activityMet, restRate, sessionKcal, dayKcal, weightFor, TIMED_MET } from '../js/calories.js';

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const H = 3600e3;
const docWith = (profile = { sex: 'm', born: 1999, cm: 178, life: 'sit' }) => {
  const d = emptyDoc();
  d.settings.profile = profile;
  d.body = { '2026-10-01': { kg: 71.2, t: 1 } };
  return d;
};
const act = (ex, sec, km = null, date = '2026-11-03') =>
  ({ id: `a${ex}${sec}`, date, tpl: null, start: 0, end: sec * 1000, items: [{ ex, sets: [{ sec, km, done: true }] }] });

test('bmr: Mifflin-St Jeor, null when a field is missing', () => {
  near(bmr({ sex: 'm', born: 1999, cm: 178 }, 71.2, 2026), 1694.5, 1e-9);
  near(bmr({ sex: 'f', born: 1999, cm: 178 }, 71.2, 2026), 1694.5 - 166, 1e-9);
  assert.equal(bmr({ sex: 'm', born: 1999 }, 71.2, 2026), null);
  assert.equal(bmr({ sex: 'x', born: 1999, cm: 178 }, 71.2, 2026), null);
  assert.equal(bmr({ sex: 'm', born: 1999, cm: 178 }, undefined, 2026), null);
});

test('activityMet: by speed for running, walking, cycling; defaults otherwise', () => {
  near(activityMet({ id: 'lib_corsa' }, 9.7), 9.8, 1e-9);
  near(activityMet({ id: 'lib_corsa' }, 10.25), 10.15, 1e-9);           // halfway between 9.7 and 10.8
  near(activityMet({ id: 'lib_corsa' }, 3), 6.0, 1e-9);                  // clamped
  near(activityMet({ id: 'lib_corsa' }), 8.0, 1e-9);
  near(activityMet({ id: 'lib_camminata' }, 4.8), 3.5, 1e-9);
  near(activityMet({ id: 'lib_tennis' }, 20), 7.3, 1e-9);                 // speed ignored
  near(activityMet({ id: 'x1', kind: 'cardio' }), 7.0, 1e-9);
  near(activityMet({ id: 'x2', kind: 'sport' }), 6.0, 1e-9);
});

test('weightFor: latest up to the day, else the first entry', () => {
  const d = docWith();
  d.body['2026-11-02'] = { kg: 70, t: 1 };
  assert.equal(weightFor(d, '2026-11-03'), 70);
  assert.equal(weightFor(d, '2026-10-15'), 71.2);
  assert.equal(weightFor(d, '2026-01-01'), 71.2);
  assert.equal(weightFor(emptyDoc(), '2026-01-01'), undefined);
});

test('restRate: own basal per minute, else 1 MET = 3.5 kg / 200', () => {
  near(restRate(docWith(), '2026-11-03').perMin, 1694.5 / 1440, 1e-9);
  const d = docWith({});
  near(restRate(d, '2026-11-03').perMin, (3.5 * 71.2) / 200, 1e-9);
  assert.equal(restRate(d, '2026-11-03').bmr, null);
  assert.equal(restRate(emptyDoc(), '2026-11-03'), null);
});

test('sessionKcal: activity at its speed; extra = above the daily-life rate', () => {
  const d = docWith();
  const pm = 1694.5 / 1440;
  const k = sessionKcal(d, act('lib_corsa', 1800, 5.2));               // 10.4 km/h
  const met = 9.8 + ((10.5 - 9.8) * (10.4 - 9.7)) / (10.8 - 9.7);
  near(k.kcal, met * 30 * pm, 1e-6);
  near(k.extra, k.kcal - 30 * pm * 1.2, 1e-6);
  assert.equal(sessionKcal(d, { ...act('lib_corsa', 1800), end: null }), null);
});

test('sessionKcal: timed day by step, scaled on the exercises done', () => {
  const d = docWith();
  d.templates = [{ id: 't', mode: 'timer', rounds: 1, roundRest: 0, items: [
    { ex: 'a', part: 'warm', rest: 0, sets: [{ sec: 60 }] },
    { ex: 'b', part: 'main', rest: 30, sets: [{ sec: 60 }] },
    { ex: 'c', part: 'main', rest: 0, sets: [{ sec: 60 }] },
    { ex: 'e', part: 'cool', rest: 0, sets: [{ sec: 60 }] }] }];
  const s = { id: 's', date: '2026-11-03', tpl: 't', mode: 'timer', start: 0, end: 5 * H,
    items: ['a', 'b', 'c', 'e'].map((ex) => ({ ex, sets: [{ sec: 60, done: true }] })) };
  const pm = 1694.5 / 1440;
  // main: b 60 s, its 30 s pause; c is the last of the round (round rest 0 -> no pause)
  const metMin = TIMED_MET.warm + TIMED_MET.work * 2 + TIMED_MET.rest * 0.5 + TIMED_MET.cool;
  near(sessionKcal(d, s).kcal, metMin * pm, 1e-6);
  s.items[3].sets[0].done = false;
  s.items[2].sets[0].done = false;
  near(sessionKcal(d, s).kcal, (metMin * pm) / 2, 1e-6);
});

test('sessionKcal: sets day by wall-clock minutes, capped at 4 h', () => {
  const d = docWith();
  const pm = 1694.5 / 1440;
  const s = { id: 'n', date: '2026-11-03', tpl: 'x', start: 0, end: H, items: [] };
  near(sessionKcal(d, s).kcal, 3.5 * 60 * pm, 1e-6);
  near(sessionKcal(d, { ...s, end: 10 * H }).kcal, 3.5 * 240 * pm, 1e-6);
});

test('dayKcal: basal + daily life + extra; null without a complete profile', () => {
  const d = docWith();
  d.sessions = [act('lib_corsa', 1800, 5.2), act('lib_calcio', 3600, null, '2026-11-02'), { ...act('lib_yoga', 600), deleted: true }];
  const k = dayKcal(d, '2026-11-03');
  const run = sessionKcal(d, d.sessions[0]);
  assert.equal(k.bmr, 1695);
  assert.equal(k.life, 339);
  assert.equal(k.extra, Math.round(run.extra));
  assert.equal(k.total, 1695 + 339 + Math.round(run.extra));               // the parts add up to the total shown
  assert.equal(k.n, 1);
  d.settings.profile.life = 'active';
  assert.equal(dayKcal(d, '2026-11-01').total, 1695 + 847);
  assert.equal(dayKcal(docWith({ sex: 'm' }), '2026-11-03'), null);
});

test('fmtKcal: whole kcal, a dot every three digits', async () => {
  const { fmtKcal } = await import('../js/ui.js');
  assert.deepEqual([0, 238.4, 999.6, 2243, 12345.4].map(fmtKcal), ['0', '238', '1.000', '2.243', '12.345']);
});
