// "A tempo" (#timer/<sessionId>): full-screen player of a timed day. Countdown ring, phase colours, next step,
// beeps in the last 3 seconds and at every change, pause, back and forward. Time comes from timestamps, so it stays right
// after the app was in the background (steps that ended meanwhile are counted as done).
import { getDoc, updateSession, finishSession, discardSession, isReadOnly } from '../store.js';
import { workoutLabel } from '../logic.js';
import { resolveExercise } from '../library.js';
import { timerSteps, totalSec, advance, clock, PART_LABELS } from '../interval.js';
import { keepAwake, tone, unlockAudio } from '../timer.js';
import { esc } from '../ui.js';
import { figureOf, mountFigure } from '../figures.js';

const PREP = 5;                       // "Preparati" seconds before the first step
const R = 108;                        // ring radius
const C = 2 * Math.PI * R;

let st = null;                        // { sid, steps, idx, startedAt, paused, leftMs, beeped, finished }
let tick = 0;
let root = null;

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#timer/')) leave();
  });
}

function leave() {
  clearInterval(tick);
  tick = 0;
  keepAwake(false);
  document.body.classList.remove('timer-on');
}

const session = () => getDoc().sessions.find((s) => s.id === st?.sid && !s.deleted) ?? null;

/** Steps of the session's day, with the preparation step first. */
function buildSteps(s) {
  const t = getDoc().templates.find((x) => x.id === s.tpl);
  if (!t) return [];
  return [{ type: 'prep', sec: PREP, part: 'prep', round: 0 }, ...timerSteps(t)];
}

function init(s) {
  const steps = buildSteps(s);
  const idx = Math.min(Math.max(0, s.timer?.idx ?? 0), steps.length);
  st = { sid: s.id, steps, idx, startedAt: Date.now(), paused: true, leftMs: (steps[idx]?.sec ?? 0) * 1000, beeped: 0, finished: false, started: idx > 0 };
}

// ---- Clock -------------------------------------------------------------------------

const leftMsNow = () => (st.paused ? st.leftMs : st.startedAt + st.steps[st.idx].sec * 1000 - Date.now());

function markDone(indexes) {
  const work = indexes.map((k) => st.steps[k]).filter((x) => x?.type === 'work');
  if (!work.length || isReadOnly()) return;
  updateSession(st.sid, (s) => {
    for (const w of work) {
      const set = s.items[w.i]?.sets[w.set];
      if (set) set.done = true;
    }
    s.timer = { idx: st.idx };
  });
}

function saveIdx() {
  if (!isReadOnly()) updateSession(st.sid, (s) => { s.timer = { idx: st.idx }; });
}

function cue(changed) {
  if (changed) {
    tone(st.idx >= st.steps.length ? 660 : 990, 0.45, 0.3);
    navigator.vibrate?.(250);
  }
}

function step() {
  if (!st || st.paused || st.finished) return;
  const r = advance(st.steps, st.idx, st.startedAt, Date.now());
  const old = st.idx;
  const changed = r.idx !== old;
  if (changed) {
    st.idx = r.idx;
    st.startedAt = r.startedAt;
    st.beeped = 0;
    markDone(r.done);
    if (!r.done.length) saveIdx();
    if (r.idx - old === 1) cue(true);                       // no sound when catching up after the background
  }
  if (r.finished) {
    st.finished = true;
    keepAwake(false);
    paint();
    return;
  }
  const left = r.left;
  if (left <= 3 && left >= 1 && st.beeped !== left) {
    st.beeped = left;
    tone(660, 0.12, 0.25);
  }
  paint();
}

function play() {
  unlockAudio();
  if (st.finished) return;
  st.started = true;
  st.startedAt = Date.now() - (st.steps[st.idx].sec * 1000 - st.leftMs);
  st.paused = false;
  keepAwake(true);
  step();
}

function pause() {
  st.leftMs = Math.max(0, leftMsNow());
  st.paused = true;
  paint();
}

/** Jump to step k: the new step starts in full; a skipped exercise is not marked done. */
function jump(k) {
  st.idx = Math.max(0, Math.min(k, st.steps.length - 1));
  st.startedAt = Date.now();
  st.leftMs = st.steps[st.idx].sec * 1000;
  st.beeped = 0;
  saveIdx();
  if (!st.paused) tone(990, 0.3, 0.25);
  paint();
}

/** Back: to the start of this step if it has run for more than 2 s, else to the previous exercise. */
function back() {
  const ran = st.steps[st.idx].sec * 1000 - leftMsNow();
  if (ran > 2000) { jump(st.idx); return; }
  let k = st.idx - 1;
  while (k > 0 && st.steps[k].type === 'rest') k--;
  jump(k);
}

/** Forward: straight to the next exercise (its pause skipped); after the last one the workout is over. */
function forward() {
  let k = st.idx + 1;
  while (k < st.steps.length && st.steps[k].type !== 'work') k++;
  if (k >= st.steps.length) {
    st.finished = true;
    keepAwake(false);
    paint();
  } else jump(k);
}

// ---- Painting ------------------------------------------------------------------------

const exName = (doc, s, i) => resolveExercise(doc, s.items[i]?.ex)?.name ?? 'Esercizio';

function label(doc, s, x) {
  if (!x) return '';
  if (x.type === 'prep') return 'Preparati';
  if (x.type === 'rest') return 'Pausa';
  return exName(doc, s, x.i);
}

function phase(x, rounds) {
  if (!x || x.type === 'prep') return { key: 'prep', text: 'Si parte' };
  if (x.type === 'rest') return { key: 'rest', text: x.part === 'main' ? `Pausa · Giro ${x.round + 1}/${rounds}` : 'Pausa' };
  if (x.part === 'main') return { key: 'work', text: `${PART_LABELS.main} · Giro ${x.round + 1}/${rounds}` };
  return { key: x.part, text: PART_LABELS[x.part] };
}

/** Figure of the current work step, or of the next one during a pause (shown dimmed). */
function paintFigure(doc, s, box) {
  const x = st.steps[st.idx];
  let k = st.idx;
  while (k < st.steps.length && st.steps[k].type !== 'work') k++;
  const w = st.steps[k];
  const ex = w ? s.items[w.i]?.ex : null;
  const fig = ex ? figureOf(doc, ex) : null;
  const holder = box.querySelector('.tr-fig');
  const key = fig ? `${ex}` : '';
  if (holder.dataset.key !== key) {
    holder.dataset.key = key;
    mountFigure(holder, fig);
  }
  holder.hidden = !fig;
  holder.classList.toggle('upcoming', x.type !== 'work');
  box.classList.toggle('has-fig', !!fig);
}

function paint() {
  if (!root || !st) return;
  const s = session();
  if (!s) return;
  const doc = getDoc();
  const t = doc.templates.find((x) => x.id === s.tpl);
  const rounds = t?.rounds ?? 1;
  const box = root.querySelector('.tr');
  if (st.finished) {
    box.dataset.phase = 'done';
    const n = s.items.reduce((a, it) => a + it.sets.filter((x) => x.done).length, 0);
    const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
    box.querySelector('.tr-main').innerHTML = `<div class="tr-done"><div class="tr-emoji" aria-hidden="true">🎉</div>
      <h2>Fatto!</h2><p>${n} ${n === 1 ? 'esercizio completato' : 'esercizi completati'} · ${mins} min</p>
      <button type="button" class="btn primary block" data-act="save">Salva allenamento</button></div>`;
    box.querySelector('.tr-foot').hidden = true;
    return;
  }
  const x = st.steps[st.idx];
  const ms = Math.max(0, leftMsNow());
  const left = Math.ceil(ms / 1000);
  const ph = phase(x, rounds);
  box.dataset.phase = ph.key;
  box.classList.toggle('paused', st.paused);
  box.classList.toggle('last', !st.paused && left <= 3);
  box.querySelector('.tr-phase').textContent = ph.text;
  // During a pause (and the start) the next exercise is announced: its name, "Prossimo" and its note.
  let k = st.idx;
  while (k < st.steps.length && st.steps[k].type !== 'work') k++;
  const w = st.steps[k];
  const note = (it) => it?.note ?? '';
  if (x.type === 'work' || !w) {
    box.querySelector('.tr-name').textContent = label(doc, s, x);
    box.querySelector('.tr-note').textContent = x.type === 'work' ? note(s.items[x.i]) : '';
  } else {
    box.querySelector('.tr-name').textContent = exName(doc, s, w.i);
    box.querySelector('.tr-note').textContent = ['Prossimo', note(s.items[w.i])].filter(Boolean).join(' · ');
  }
  paintFigure(doc, s, box);
  box.querySelector('.tr-time').textContent = clock(left);
  box.querySelector('.tr-ring-fg').style.strokeDashoffset = String(C * (1 - ms / (x.sec * 1000)));
  const nx = st.steps[st.idx + 1];
  box.querySelector('.tr-next').innerHTML = x.type !== 'work' && nx?.type === 'work'
    ? `<small>Durata</small><b>${esc(clock(nx.sec))}</b>`
    : nx ? `<small>Poi</small><b>${esc(label(doc, s, nx))}</b><span>${esc(clock(nx.sec))}</span>`
    : '<small>Poi</small><b>Fine</b>';
  const done = st.steps.slice(0, st.idx).reduce((a, k) => a + k.sec, 0) + (x.sec - ms / 1000);
  const all = totalSec(st.steps);
  box.querySelector('.tr-bar i').style.width = `${Math.min(100, (done / all) * 100)}%`;
  box.querySelector('.tr-total').textContent = `Rimangono ${clock(all - done)}`;
  const pp = box.querySelector('[data-act=toggle]');
  pp.innerHTML = st.paused ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
  pp.setAttribute('aria-label', st.paused ? (st.started ? 'Riprendi' : 'Inizia') : 'Pausa');
  box.querySelector('.tr-hint').hidden = st.started;
}

function save() {
  finishSession(st.sid, {});
  leave();
  const id = st.sid;
  st = null;
  location.hash = `#sessione/${encodeURIComponent(id)}`;
}

function end() {
  const s = session();
  const any = s?.items.some((it) => it.sets.some((x) => x.done));
  if (!any) {
    if (!confirm('Uscire senza salvare? Non hai ancora completato nessun esercizio.')) return;
    if (!isReadOnly()) discardSession(st.sid);
    leave();
    st = null;
    location.hash = '#oggi';
    return;
  }
  if (!confirm('Terminare adesso? Salvo gli esercizi già fatti.')) return;
  save();
}

// ---- Render --------------------------------------------------------------------------

export function render(el, { doc, param }) {
  const s = doc.sessions.find((x) => x.id === param && !x.deleted);
  if (!s || s.end != null) {
    location.replace(s ? `#sessione/${encodeURIComponent(s.id)}` : '#oggi');
    return;
  }
  if (!st || st.sid !== s.id) init(s);
  root = el;
  document.body.classList.add('timer-on');
  const title = workoutLabel(doc, s.tpl);
  el.innerHTML = `<div class="tr" data-phase="prep">
    <header class="tr-top">
      <a class="tr-icon" href="#oggi" aria-label="Esci (il timer continua)">‹</a>
      <span class="tr-title">${esc(title)}</span>
      <button type="button" class="tr-end" data-act="end">Termina</button>
    </header>
    <div class="tr-main">
      <p class="tr-phase"></p>
      <h1 class="tr-name"></h1>
      <p class="tr-note"></p>
      <div class="tr-fig" hidden></div>
      <div class="tr-ring">
        <svg viewBox="0 0 240 240" aria-hidden="true"><circle class="tr-ring-bg" cx="120" cy="120" r="${R}"/>
          <circle class="tr-ring-fg" cx="120" cy="120" r="${R}" stroke-dasharray="${C}" transform="rotate(-90 120 120)"/></svg>
        <div class="tr-time" role="timer" aria-live="off"></div>
      </div>
      <p class="tr-hint">Tocca ▶ per iniziare. Alza il volume: senti un bip negli ultimi 3 secondi e a ogni cambio.</p>
      <div class="tr-next"></div>
    </div>
    <footer class="tr-foot">
      <div class="tr-ctrl">
        <button type="button" class="tr-skip" data-act="back" aria-label="Esercizio precedente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6v12M18 6.5 9.5 12 18 17.5z"/></svg></button>
        <button type="button" class="tr-play" data-act="toggle"></button>
        <button type="button" class="tr-skip" data-act="skip" aria-label="Esercizio successivo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6v12M6 6.5 14.5 12 6 17.5z"/></svg></button>
      </div>
      <div class="tr-bar"><i></i></div>
      <p class="tr-total"></p>
    </footer>
  </div>`;
  if (!st.steps.length) {
    el.querySelector('.tr-main').innerHTML = '<p class="tr-phase">Questo giorno non ha esercizi a tempo.</p>';
    el.querySelector('.tr-foot').hidden = true;
    return;
  }
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'toggle') (st.paused ? play : pause)();
    else if (act === 'back') back();
    else if (act === 'skip') forward();
    else if (act === 'end') end();
    else if (act === 'save') save();
  };
  clearInterval(tick);
  tick = setInterval(step, 200);
  if (!st.paused) keepAwake(true);
  paint();
}
