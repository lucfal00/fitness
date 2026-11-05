// "A tempo" (#timer/<sessionId>): full-screen player of a timed day. Countdown ring, phase colours, next step,
// a beep in each of the last 3 seconds (red colours at the end of a circuit exercise), a beep halfway through exercises
// longer than 30 s, a long beep at every change; pause, back and forward. Time comes from timestamps, so it stays right
// after the app was in the background (steps that ended meanwhile are counted as done); beeps are scheduled on the audio
// clock for the running step, so they fall exactly on the second.
import { getDoc, updateSession, finishSession, discardSession, isReadOnly, setSetting } from '../store.js';
import { workoutLabel, schedaOf } from '../logic.js';
import { resolveExercise } from '../library.js';
import { timerSteps, totalSec, advance, clock, PART_LABELS, sideTag } from '../interval.js';
import { keepAwake, unlockAudio, setAudioSession, releaseAudio, scheduleTone, cancelTones } from '../timer.js';
import { esc, fmtKcal } from '../ui.js';
import { sessionKcal } from '../calories.js';
import { figureOf, mountFigure } from '../figures.js';

const PREP = 5;                       // "Preparati" seconds before the first step
const WARN = 3;                       // last seconds of a step: a beep each second (red colours on circuit exercises)
const HALF_FROM = 30;                 // exercises longer than this get a beep halfway
const R = 108;                        // ring radius
const C = 2 * Math.PI * R;

let st = null;                        // { sid, steps, idx, startedAt, paused, leftMs, finished, started, rpe }
let tick = 0;
let raf = 0;
let root = null;
let away = false;                     // the timer screen was left (its tones cancelled) while the workout went on

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#timer/')) leave();
  });
  document.addEventListener('visibilitychange', () => {   // the audio clock stops in the background: schedule again
    if (document.visibilityState === 'visible' && st && !st.paused && location.hash.startsWith('#timer/')) {
      step();
      schedule();
    }
  });
}

function leave() {
  away = true;
  cancelTones();
  if (!st || st.paused || st.finished) {           // a running workout keeps its audio: beeps go on on return
    setAudioSession('auto');
    releaseAudio();
  }
  clearInterval(tick);
  tick = 0;
  cancelAnimationFrame(raf);
  raf = 0;
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
  st = { sid: s.id, steps, idx, startedAt: Date.now(), paused: true, leftMs: (steps[idx]?.sec ?? 0) * 1000, finished: false, started: idx > 0 };
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

/** Beeps of the running step on the audio clock: halfway (exercises over 30 s), each of the last 3 seconds, and the
 *  long change beep at its end (lower after the last step). Replaces whatever was scheduled, except at a step change:
 *  the previous step's last beeps may still be due on a lagging audio clock (iPad) and must not be cut. */
function schedule(replace = true) {
  if (replace) cancelTones();
  if (!st || st.paused || st.finished) return;
  const x = st.steps[st.idx];
  const left = Math.max(0, leftMsNow()) / 1000;
  if (x.type === 'work' && x.sec > HALF_FROM && left > x.sec / 2) scheduleTone(left - x.sec / 2);
  for (let k = 1; k <= WARN; k++) if (left > k) scheduleTone(left - k);
  const last = st.idx === st.steps.length - 1;
  scheduleTone(left, last ? 660 : 1320, 0.5, 0.8);
}

function step() {
  if (!st || st.paused || st.finished) return;
  const r = advance(st.steps, st.idx, st.startedAt, Date.now());
  const old = st.idx;
  const changed = r.idx !== old;
  if (changed) {
    st.idx = r.idx;
    st.startedAt = r.startedAt;
    markDone(r.done);
    if (!r.done.length) saveIdx();
    if (r.idx - old === 1) navigator.vibrate?.(250);
    schedule(false);                                         // the new step's beeps (its change beep is already due)
  }
  if (r.finished) {
    st.finished = true;
    keepAwake(false);
    endAudio();
    paint();
    return;
  }
  paint();
}

/** After the last beep the page lets go of the audio, so paused music can be resumed from its app. */
function endAudio() {
  setTimeout(() => {
    if (!st?.finished) return;
    setAudioSession('auto');
    releaseAudio();
  }, 1500);
}

function play() {
  setAudioSession(getDoc().settings.loud ? 'playback' : 'ambient');
  unlockAudio();
  if (st.finished) return;
  st.started = true;
  st.startedAt = Date.now() - (st.steps[st.idx].sec * 1000 - st.leftMs);
  st.paused = false;
  keepAwake(true);
  step();
  schedule();
}

function pause() {
  st.leftMs = Math.max(0, leftMsNow());
  st.paused = true;
  cancelTones();
  paint();
}

/** Jump to step k: the new step starts in full; a skipped exercise is not marked done. */
function jump(k) {
  st.idx = Math.max(0, Math.min(k, st.steps.length - 1));
  st.startedAt = Date.now();
  st.leftMs = st.steps[st.idx].sec * 1000;
  saveIdx();
  if (!st.paused) scheduleTone(0, 1320, 0.3, 0.6);
  schedule();
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
    cancelTones();
    keepAwake(false);
    endAudio();
    paint();
  } else jump(k);
}

// ---- Painting ------------------------------------------------------------------------

const schedaName = (doc, s) => schedaOf(doc, s.tpl)?.name ?? workoutLabel(doc, s.tpl);
const exName = (doc, s, i) => resolveExercise(doc, s.items[i]?.ex)?.name ?? 'Esercizio';
/** Exercise name with its side or direction (D / S, O / A, Avanti / Indietro) as a tag. */
const exHtml = (doc, s, i) => {
  const tag = sideTag(s.items[i]?.note);
  return `${esc(exName(doc, s, i))}${tag ? ` <span class="tr-tag">${esc(tag)}</span>` : ''}`;
};

function label(doc, s, x) {
  if (!x) return '';
  if (x.type === 'prep') return 'Preparati';
  if (x.type === 'rest') return 'Pausa';
  return exName(doc, s, x.i);
}

function phase(x) {
  if (!x || x.type === 'prep') return { key: 'prep', text: 'Si parte' };
  if (x.type === 'rest') return { key: 'rest', text: 'Pausa' };
  return { key: x.part === 'main' ? 'work' : x.part, text: PART_LABELS[x.part] };
}

/** Indexes of the work steps of the part (and round, in the circuit) of step k; the start counts as the first part. */
function groupOf(k) {
  let j = k;
  while (j < st.steps.length && st.steps[j].type === 'prep') j++;
  const x = st.steps[j];
  if (!x) return [];
  return st.steps.flatMap((y, n) => (y.type === 'work' && y.part === x.part && y.round === x.round ? [n] : []));
}

/** One segment per exercise of the group: done ones full, the running one filling up. */
function paintSegs(box) {
  const g = groupOf(st.idx);
  const holder = box.querySelector('.tr-segs');
  const key = g.join(',');
  if (holder.dataset.key !== key) {
    holder.dataset.key = key;
    holder.innerHTML = g.map(() => '<i><b></b></i>').join('');
  }
  const ms = Math.max(0, leftMsNow());
  const x = st.steps[st.idx];
  holder.querySelectorAll('b').forEach((b, n) => {
    const j = g[n];
    const f = j < st.idx ? 1 : j === st.idx ? 1 - ms / (x.sec * 1000) : 0;
    b.style.width = `${Math.min(100, Math.max(0, f * 100))}%`;
  });
  return g;
}

/** Figure of the current work step, or of the next one during a pause (shown dimmed). */
function paintFigure(doc, s, box) {
  const x = st.steps[st.idx];
  let k = st.idx;
  while (k < st.steps.length && st.steps[k].type !== 'work') k++;
  const w = st.steps[k];
  const ex = w ? s.items[w.i]?.ex : null;
  const note = w ? s.items[w.i]?.note ?? '' : '';
  const fig = ex ? figureOf(doc, ex, note) : null;
  const holder = box.querySelector('.tr-fig');
  const key = fig ? `${ex}|${note}` : '';
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
    if (box.querySelector('.tr-done')) return;              // drawn once: the effort choice stays
    const n = s.items.reduce((a, it) => a + it.sets.filter((x) => x.done).length, 0);
    const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
    const k = sessionKcal(doc, { ...s, end: Date.now() });
    const tile = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
    box.querySelector('.tr-main').innerHTML = `<div class="tr-done">
      <div class="tr-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h2>Fatto</h2><p>${esc(workoutLabel(doc, s.tpl))}</p>
      <div class="tr-sum">${tile(mins, 'Minuti')}${tile(k ? fmtKcal(k.kcal) : '–', 'kcal')}${tile(n, n === 1 ? 'Esercizio' : 'Esercizi')}</div>
      <p class="tr-ask">Com’è andata?</p>
      <div class="tr-rpe" role="group" aria-label="Fatica da 1 a 10">${Array.from({ length: 10 }, (_, j) => j + 1)
        .map((v) => `<button type="button" data-act="rpe" data-v="${v}" aria-pressed="${st.rpe === v}" class="${st.rpe === v ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="tr-rpe-ends"><span>Leggero</span><span>Al limite</span></div>
      <button type="button" class="btn primary block" data-act="save">Salva allenamento</button></div>`;
    box.querySelector('.tr-foot').hidden = true;
    return;
  }
  const x = st.steps[st.idx];
  const ms = Math.max(0, leftMsNow());
  const left = Math.ceil(ms / 1000);
  const ph = phase(x);
  box.dataset.phase = ph.key;
  const g = groupOf(st.idx);
  const gx = st.steps[g[0]];
  box.querySelector('.tr-title').textContent = gx?.part === 'main' && rounds > 1 ? `Giro ${gx.round + 1} di ${rounds}` : schedaName(doc, s);
  box.classList.toggle('paused', st.paused);
  box.classList.toggle('last', !st.paused && left <= WARN && x.type === 'work' && x.part === 'main');
  box.querySelector('.tr-phase').textContent = ph.text;
  // During a pause (and the start) the next exercise is announced: its name, "Prossimo" and its note.
  let k = st.idx;
  while (k < st.steps.length && st.steps[k].type !== 'work') k++;
  const w = st.steps[k];
  const note = (it) => it?.note ?? '';
  if (x.type === 'work' || !w) {
    box.querySelector('.tr-name').innerHTML = x.type === 'work' ? exHtml(doc, s, x.i) : esc(label(doc, s, x));
    box.querySelector('.tr-note').textContent = x.type === 'work' ? note(s.items[x.i]) : '';
  } else {
    box.querySelector('.tr-name').innerHTML = exHtml(doc, s, w.i);
    box.querySelector('.tr-note').textContent = ['Prossimo', note(s.items[w.i])].filter(Boolean).join(' · ');
  }
  paintFigure(doc, s, box);
  box.querySelector('.tr-time').textContent = clock(left);
  const nx = st.steps[st.idx + 1];
  box.querySelector('.tr-next').innerHTML = x.type !== 'work' && nx?.type === 'work'
    ? `<small>Durata</small><b>${esc(clock(nx.sec))}</b>`
    : nx ? `<small>Poi</small><b>${nx.type === 'work' ? exHtml(doc, s, nx.i) : esc(label(doc, s, nx))}</b><span>${esc(clock(nx.sec))}</span>`
    : '<small>Poi</small><b>Fine</b>';
  const done = st.steps.slice(0, st.idx).reduce((a, k) => a + k.sec, 0) + (x.sec - ms / 1000);
  const all = totalSec(st.steps);
  paintSegs(box);
  const pos = g.filter((j) => (x.type === 'work' ? j <= st.idx : j < st.idx)).length;   // in a pause: the one coming
  box.querySelector('.tr-count').textContent = g.length ? `Esercizio ${Math.max(1, Math.min(g.length, x.type === 'work' ? pos : pos + 1))} di ${g.length}` : '';
  box.querySelector('.tr-left').textContent = `${clock(all - done)} rimanenti`;
  const pp = box.querySelector('[data-act=toggle]');
  pp.innerHTML = st.paused ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
  pp.setAttribute('aria-label', st.paused ? (st.started ? 'Riprendi' : 'Inizia') : 'Pausa');
  box.querySelector('.tr-hint').hidden = st.started;
  box.querySelector('.tr-sound').hidden = st.started;
  box.querySelector('.tr-next').hidden = !st.started;           // before the start: the sound choice in its place
}

/** Ring and segments, every frame: smooth also on short steps (the 200 ms tick only updates the text). */
function smooth() {
  raf = 0;
  if (!root || !st || st.finished || !root.isConnected) return;
  const box = root.querySelector('.tr');
  const x = st.steps[st.idx];
  if (box && x) {
    const ms = Math.max(0, leftMsNow());
    box.querySelector('.tr-ring-fg').style.strokeDashoffset = String(C * (1 - ms / (x.sec * 1000)));
    paintSegs(box);
  }
  raf = requestAnimationFrame(smooth);
}

function save() {
  finishSession(st.sid, { rpe: st.rpe ?? null });
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
  const title = schedaName(doc, s);
  el.innerHTML = `<div class="tr" data-phase="prep">
    <header class="tr-top">
      <a class="tr-icon" href="#oggi" aria-label="Esci (il timer continua)">‹</a>
      <span class="tr-title">${esc(title)}</span>
      <button type="button" class="tr-end" data-act="end" aria-label="Termina l’allenamento">Fine</button>
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
      <p class="tr-hint">Tocca ▶ per iniziare</p>
      <div class="tr-sound" role="group" aria-label="Suono">
        <button type="button" data-act="loud" data-v="0" aria-pressed="${!doc.settings.loud}">Musica sotto</button>
        <button type="button" data-act="loud" data-v="1" aria-pressed="${!!doc.settings.loud}">Bip anche in silenzioso</button>
        <small>${doc.settings.loud ? 'La musica di altre app si ferma' : 'Con il silenzioso attivo non senti i bip'}</small></div>
      <div class="tr-next"></div>
    </div>
    <footer class="tr-foot">
      <div class="tr-ctrl">
        <button type="button" class="tr-skip" data-act="back" aria-label="Esercizio precedente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6v12M18 6.5 9.5 12 18 17.5z"/></svg></button>
        <button type="button" class="tr-play" data-act="toggle"></button>
        <button type="button" class="tr-skip" data-act="skip" aria-label="Esercizio successivo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6v12M6 6.5 14.5 12 6 17.5z"/></svg></button>
      </div>
      <div class="tr-segs" aria-hidden="true"></div>
      <p class="tr-total"><span class="tr-count"></span><span class="tr-left"></span></p>
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
    else if (act === 'loud') setSetting('loud', b.dataset.v === '1');   // the view is drawn again with the choice
    else if (act === 'rpe') {
      const v = +b.dataset.v;
      st.rpe = st.rpe === v ? null : v;
      el.querySelectorAll('[data-act=rpe]').forEach((c) => {
        const on = +c.dataset.v === st.rpe;
        c.classList.toggle('on', on);
        c.setAttribute('aria-pressed', String(on));
      });
    }
  };
  clearInterval(tick);
  tick = setInterval(step, 200);
  if (!st.paused) keepAwake(true);
  if (away && !st.paused && !st.finished) schedule();    // back from another screen: the current step's beeps
  away = false;
  paint();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(smooth);
}
