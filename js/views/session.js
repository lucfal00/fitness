// "Allenamento" (#sessione/<id>): live workout with total timer and rest bar; also edits a concluded session.
// app.js does not redraw this view on its own session's store events: every change patches only what it touched.
import { resolveExercise, listExercises } from '../library.js';
import { getDoc, updateSession, finishSession, discardSession, isReadOnly } from '../store.js';
import { todayKey } from '../logic.js';
import { sessionVolume, sessionRecords, pace } from '../metrics.js';
import {
  startRest, adjustRest, skipRest, restState, onRest, unlockAudio, beep, keepAwake,
} from '../timer.js';
import { esc, safeColor, fmtDay, fmtKg, fmtNum, fmtDuration } from '../ui.js';
import {
  openSheet, openExerciseSheet, filterBar, bindFilterBar, filterExercises, exerciseMeta,
} from './exercises.js';
import {
  FIELDS, shapeOf, isStrength, stepValue, parseField, fmtField, groupLabels, restAfter, structureChanged,
  setCounts, newSets, nextSet, warmIndex, viewContext, infoHtml, cardHtml, fmtMinutes,
} from './session-rows.js';

let sid = null;            // session on screen
let root = null;           // view container (<main>)
let rc = null;             // row-builder context of the last draw
let notes = new Set();     // item indexes whose note field was opened from the menu
let clock = 0;             // elapsed-time interval
let bound = false;         // focus / Enter listeners attached to root
let bar = null;            // rest bar (on <body>, outside the redrawn view)
let barMode = '';          // '' | 'run' | 'done'
let restTotal = 0;         // seconds of the running rest (progress fill)
let restDone = false;      // "Recupero finito" pending
let hideTimer = 0;
let refresh = () => {};    // app-level redraw (banner + view)

const cur = () => getDoc().sessions.find((x) => x.id === sid && !x.deleted) ?? null;
const onRoute = () => location.hash.startsWith('#sessione/');
const isLive = (s) => !!s && s.end == null;
const dayHash = (d) => (d === todayKey() ? '#oggi' : `#oggi/${d}`);

function titleOf(doc, s) {
  const t = s.tpl ? doc.templates.find((x) => x.id === s.tpl) : null;
  return { name: t?.name ?? 'Allenamento libero', emoji: t ? t.emoji || '💪' : '🏋️', color: safeColor(t?.color) };
}

function headText(s) {
  const { done, total } = setCounts(s);
  const sets = `${done}/${total} serie`;
  if (isLive(s)) return `${fmtDuration((Date.now() - s.start) / 1000)} · ${sets}`;
  return `${fmtDay(s.date)} · ${fmtMinutes(s.end - s.start)} · ${sets}`;
}

/** Edit the session in the store; false when nothing was saved (read-only, missing). */
function mutate(fn) {
  if (isReadOnly() || !cur()) return false;
  let ok = false;
  updateSession(sid, (s) => {
    fn(s);
    ok = true;
  });
  if (isReadOnly()) {                                   // storage just failed: banner + disabled controls
    refresh();
    return false;
  }
  return ok;
}

// ---- Summary (finish sheet and concluded sessions) ---------------------------------

const REC = {
  maxKg: 'carico massimo', e1rm: 'massimale stimato', volume: 'volume', maxReps: 'ripetizioni massime',
  maxKm: 'distanza massima', bestPace: 'passo migliore',
};

function recordText(r, shape) {
  if (r.kind === 'maxSec') return `${shape === 'time' ? 'secondi massimi' : 'durata massima'} ${shape === 'time' ? `${r.value} s` : fmtDuration(r.value)}`;
  if (r.kind === 'maxReps') return `${REC.maxReps} ${r.value}`;
  if (r.kind === 'maxKm') return `${REC.maxKm} ${fmtKg(r.value)} km`;
  if (r.kind === 'bestPace') return `${REC.bestPace} ${pace(r.value, 1)}/km`;
  return `${REC[r.kind]} ${fmtNum(r.value)} kg`;
}

/** One line per exercise with records (best load per reps condensed into ranges) and one for firsts. */
function recordLines(doc, rec) {
  const byEx = new Map();
  for (const r of rec.records) {
    if (!byEx.has(r.ex)) byEx.set(r.ex, []);
    byEx.get(r.ex).push(r);
  }
  const lines = [];
  for (const [ex, list] of byEx) {
    const e = resolveExercise(doc, ex);
    const shape = shapeOf(e);
    const parts = list.filter((r) => r.kind !== 'repMax').map((r) => recordText(r, shape));
    const reps = list.filter((r) => r.kind === 'repMax').sort((a, b) => a.reps - b.reps);
    for (let k = 0; k < reps.length;) {
      let m = k;
      while (m + 1 < reps.length && reps[m + 1].value === reps[k].value && reps[m + 1].reps === reps[m].reps + 1) m++;
      parts.push(`${fmtKg(reps[k].value)} kg per ${m > k ? `${reps[k].reps}–${reps[m].reps}` : reps[k].reps} rip`);
      k = m + 1;
    }
    lines.push(`<li><span aria-hidden="true">🏆</span><span class="grow"><b>${esc(e?.name ?? 'Esercizio')}</b>
      <small>${esc(parts.join(' · '))}</small></span></li>`);
  }
  if (rec.firsts.length) {
    const names = rec.firsts.map((id) => resolveExercise(doc, id)?.name ?? 'Esercizio');
    lines.push(`<li><span aria-hidden="true">✨</span><span class="grow"><b>Prima volta</b>
      <small>${esc(names.join(', '))}</small></span></li>`);
  }
  return lines.join('');
}

function summaryHtml(doc, s, ms) {
  const vol = sessionVolume(doc, s);
  const { done, total } = setCounts(s);
  const lines = recordLines(doc, sessionRecords(doc, s));
  return `<div class="tiles sum-tiles">
      <div class="card tile"><b>${Math.max(0, Math.round(ms / 60000))}</b><small>minuti</small></div>
      <div class="card tile"><b>${vol ? esc(fmtNum(vol)) : '–'}</b><small>kg volume</small></div>
      <div class="card tile"><b>${done}/${total}</b><small>serie fatte</small></div></div>
    ${!done && total ? '<p class="muted">Nessuna serie segnata come fatta.</p>' : ''}
    ${lines ? `<ul class="rows rec-list">${lines}</ul>` : ''}`;
}

function rpeChips(value, act, dis) {
  return `<div class="rpe" role="group" aria-label="RPE da 1 a 10">${Array.from({ length: 10 }, (_, k) => k + 1)
    .map((v) => `<button type="button" class="chip${value === v ? ' on' : ''}" data-act="${act}" data-v="${v}"
      aria-pressed="${value === v}" ${dis}>${v}</button>`).join('')}</div>`;
}

const paintChips = (scope, act, value) => scope.querySelectorAll(`[data-act="${act}"]`).forEach((c) => {
  const on = +c.dataset.v === value;
  c.classList.toggle('on', on);
  c.setAttribute('aria-pressed', String(on));
});

function concludedCard(doc, s, ro) {
  const dis = ro ? 'disabled' : '';
  return `<section class="card sess-sum">
    <h2>Riepilogo</h2>
    ${summaryHtml(doc, s, s.end - s.start)}
    <div class="form">
      <fieldset><legend>Fatica percepita dell’allenamento (RPE)</legend>${rpeChips(s.rpe, 'srpe', dis)}</fieldset>
      <label class="field">Nota<textarea data-act="snote" rows="2" maxlength="500" ${dis}>${esc(s.note)}</textarea></label>
    </div>
  </section>`;
}

// ---- Drawing ----------------------------------------------------------------

function draw() {
  const s = cur();
  if (!s) {
    location.replace('#oggi');
    return;
  }
  const doc = getDoc();
  const ro = isReadOnly();
  const live = isLive(s);
  const t = titleOf(doc, s);
  const labels = groupLabels(s.items);
  rc = viewContext(doc, s, ro, notes);
  root.innerHTML = `
    <header class="sess-head">
      <span class="badge" style="--c:${t.color}" aria-hidden="true">${esc(t.emoji)}</span>
      <div class="grow"><h1>${esc(t.name)}</h1><small class="sess-timer">${esc(headText(s))}</small></div>
      ${live ? `<button type="button" class="btn primary" data-act="finish" ${ro ? 'disabled' : ''}>Termina</button>`
    : '<button type="button" class="btn" data-act="close">Chiudi</button>'}
    </header>
    ${ro ? '<div class="card notice"><p>Modalità sola lettura: le modifiche non vengono salvate.</p></div>' : ''}
    ${s.items.length ? '' : `<div class="card empty"><p class="muted">${s.tpl ? 'Nessun esercizio.' : 'Allenamento libero: aggiungi il primo esercizio.'}</p></div>`}
    <div class="ex-cards">${s.items.map((_, i) => cardHtml(rc, i, labels[i])).join('')}</div>
    <button type="button" class="btn block" data-act="add" ${ro ? 'disabled' : ''}>+ Aggiungi esercizio</button>
    ${live ? '' : concludedCard(doc, s, ro)}
    <button type="button" class="btn danger block sess-discard" data-act="discard" ${ro ? 'disabled' : ''}>${live ? 'Scarta allenamento' : 'Elimina allenamento'}</button>`;
  root.onclick = onClick;
  root.onchange = onChange;
  clearInterval(clock);
  clock = live ? setInterval(tickClock, 1000) : 0;
  paintRest();
}

/** Full redraw keeping the scroll position (structural changes). */
function redraw() {
  const y = window.scrollY;
  draw();
  window.scrollTo(0, y);
}

function redrawCard(i) {
  const s = cur();
  const card = root?.querySelector(`.ex-card[data-i="${i}"]`);
  if (!s || !card || !s.items[i]) {
    redraw();
    return;
  }
  rc = viewContext(getDoc(), s, isReadOnly(), notes);
  card.outerHTML = cardHtml(rc, i, groupLabels(s.items)[i]);
  updateHead();
}

/** Patch one set row in place (inputs that have focus keep their text). */
function syncRow(i, j) {
  const s = cur();
  const row = root?.querySelector(`.ex-card[data-i="${i}"] .set-row[data-j="${j}"]`);
  const set = s?.items[i]?.sets[j];
  if (!row || !set) {
    redraw();
    return;
  }
  rc.doc = getDoc();
  rc.s = s;
  row.classList.toggle('done', !!set.done);
  const chk = row.querySelector('.check');
  chk.classList.toggle('on', !!set.done);
  chk.setAttribute('aria-pressed', String(!!set.done));
  for (const st of row.querySelectorAll('.stepper')) {
    const inp = st.querySelector('input');
    if (inp !== document.activeElement) inp.value = fmtField(st.dataset.f, set[FIELDS[st.dataset.f].key]);
  }
  row.querySelector('.info').innerHTML = infoHtml(rc, i, j);
  updateHead();
}

function updateHead() {
  const s = cur();
  const el = root?.querySelector('.sess-timer');
  if (s && el) el.textContent = headText(s);
}

function tickClock() {
  const s = cur();
  if (!s || !isLive(s) || !onRoute() || !root?.querySelector('.sess-timer')) {
    clearInterval(clock);
    clock = 0;
    return;
  }
  updateHead();
}

// ---- Rest bar -----------------------------------------------------------------

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'rest-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Recupero');
  bar.onclick = (e) => {
    unlockAudio();
    const b = e.target.closest('button[data-r]');
    if (!b) return;
    const r = b.dataset.r;
    if (r === 'skip') skipRest();
    else if (r === 'ok') {
      restDone = false;
      paintRest();
    } else {
      restTotal = Math.max(1, restTotal + Number(r));
      adjustRest(Number(r));
    }
  };
  document.body.appendChild(bar);
  return bar;
}

function paintRest() {
  const st = restState();
  const show = onRoute() && isLive(cur());
  const mode = !show ? '' : st.running ? 'run' : restDone ? 'done' : '';
  if (!bar && !mode) return;
  const b = ensureBar();
  if (mode !== barMode) {
    barMode = mode;
    b.hidden = !mode;
    b.classList.toggle('done', mode === 'done');
    document.body.classList.toggle('resting', !!mode);
    if (mode === 'run') {
      b.innerHTML = `<button type="button" class="btn" data-r="-15" aria-label="Togli 15 secondi">−15</button>
        <div class="time"><span></span><small>Recupero</small></div>
        <button type="button" class="btn" data-r="15" aria-label="Aggiungi 15 secondi">+15</button>
        <button type="button" class="btn" data-r="skip">Salta</button>
        <div class="rest-fill" aria-hidden="true"></div>`;
    } else if (mode === 'done') {
      b.innerHTML = '<div class="time" role="status">Recupero finito</div><button type="button" class="btn" data-r="ok">OK</button>';
    } else {
      b.innerHTML = '';
    }
  }
  if (mode === 'run') {
    b.querySelector('.time span').textContent = fmtDuration(st.remaining);
    b.querySelector('.rest-fill').style.width = `${Math.min(100, (st.remaining / Math.max(1, restTotal)) * 100)}%`;
  }
}

/** "Recupero finito" disappears after 8 s of the app being visible. */
function scheduleHide() {
  clearTimeout(hideTimer);
  if (!restDone || document.visibilityState !== 'visible') return;
  hideTimer = setTimeout(() => {
    restDone = false;
    paintRest();
  }, 8000);
}

function onRestEvent(e) {
  if (e.type === 'done') {
    const late = Date.now() - restState().until > 2000;       // ended while the app was in the background
    if (!late && document.visibilityState === 'visible' && getDoc().settings.sound) beep();
    restDone = true;
    scheduleHide();
  } else if (e.type === 'stop' || e.running) {
    restDone = false;
  }
  paintRest();
}

/** Leaving the screen: screen may sleep again, timers stop, rest bar hidden (the rest itself keeps running). */
function leave() {
  keepAwake(false);
  clearInterval(clock);
  clock = 0;
  paintRest();
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (!onRoute()) leave();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleHide();
    else clearTimeout(hideTimer);
  });
  onRest(onRestEvent);
}

// ---- Row actions ------------------------------------------------------------------

function step(i, j, field, dir) {
  const key = FIELDS[field].key;
  const ok = mutate((s) => {
    const set = s.items[i]?.sets[j];
    if (!set) return;
    set[key] = stepValue(field, set[key], dir, getDoc().settings.kgStep);
    delete set.tag;                                   // the suggestion no longer describes the value
  });
  if (ok) syncRow(i, j);
}

function commitValue(inp) {
  const i = +inp.closest('.ex-card').dataset.i;
  const j = +inp.closest('.set-row').dataset.j;
  const field = inp.closest('.stepper').dataset.f;
  const key = FIELDS[field].key;
  const set = cur()?.items[i]?.sets[j];
  if (!set) return;
  const v = parseField(field, inp.value);
  if (v !== undefined && v !== set[key]) {
    mutate((s) => {
      const x = s.items[i]?.sets[j];
      if (!x) return;
      x[key] = v;
      delete x.tag;
    });
  }
  inp.value = fmtField(field, cur()?.items[i]?.sets[j]?.[key]);   // normalised, or the old value when invalid
  syncRow(i, j);
}

function toggleDone(i, j) {
  let done = false;
  const ok = mutate((s) => {
    const set = s.items[i]?.sets[j];
    if (!set) return;
    set.done = !set.done;
    done = set.done;
  });
  if (!ok) return;
  syncRow(i, j);
  const s = cur();
  if (!done || !isLive(s)) return;                     // unticking never starts a rest
  const sec = restAfter(getDoc(), s, i, j);
  if (sec > 0) {
    restTotal = sec;
    restDone = false;
    startRest(sec);
  }
}

function addSet(i, warm) {
  const ok = mutate((s) => {
    const it = s.items[i];
    if (!it) return;
    const set = nextSet(it, warm);
    if (warm) it.sets.splice(warmIndex(it), 0, set);
    else it.sets.push(set);
  });
  if (ok) redrawCard(i);
}

function openSetSheet(i, j) {
  const it = cur()?.items[i];
  const set = it?.sets[j];
  if (!set) return;
  const ex = resolveExercise(getDoc(), it.ex);
  const shape = shapeOf(ex);
  const dis = isReadOnly() ? 'disabled' : '';
  const n = it.sets.slice(0, j + 1).filter((x) => !x.w).length;
  const { box, close } = openSheet(`
    <h2>${set.w ? 'Riscaldamento' : `Serie ${n}`} · ${esc(ex?.name ?? 'Esercizio')}</h2>
    <div class="form">
      ${shape !== 'sport' ? `<fieldset><legend>RPE della serie (fatica percepita)</legend>${rpeChips(set.rpe, 'rpe', dis)}</fieldset>` : ''}
      ${shape === 'reps' || shape === 'time' ? `<label class="field">Zavorra (kg)<input type="text" inputmode="decimal" data-m="ballast"
        value="${esc(fmtField('kg', set.kg))}" placeholder="nessuna" autocomplete="off" enterkeyhint="done" ${dis}></label>` : ''}
    </div>
    ${isStrength(shape) ? `<button type="button" class="btn" data-m="warm" ${dis}>${set.w ? 'Segna come serie di lavoro' : 'Segna come riscaldamento (R)'}</button>` : ''}
    <button type="button" class="btn danger" data-m="del" ${dis}>✕ Elimina serie</button>
    <button type="button" class="btn" data-m="cancel">Chiudi</button>`);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'rpe') {
      const v = +b.dataset.v;
      close();
      if (mutate((s) => {
        const x = s.items[i]?.sets[j];
        if (x) x.rpe = x.rpe === v ? null : v;
      })) syncRow(i, j);
      return;
    }
    const m = b.dataset.m;
    if (!m) return;
    close();
    if (m === 'warm' && mutate((s) => {
      const x = s.items[i]?.sets[j];
      if (!x) return;
      x.w = !x.w;
      delete x.tag;
    })) redrawCard(i);
    else if (m === 'del' && mutate((s) => { s.items[i]?.sets.splice(j, 1); })) redrawCard(i);
  };
  const bal = box.querySelector('[data-m="ballast"]');
  if (bal) {
    bal.onkeydown = (e) => { if (e.key === 'Enter') bal.blur(); };
    bal.onchange = () => {
      const v = parseField('kg', bal.value);
      if (v === undefined) {
        bal.value = fmtField('kg', cur()?.items[i]?.sets[j]?.kg);
        return;
      }
      if (mutate((s) => {
        const x = s.items[i]?.sets[j];
        if (x) x.kg = v || null;                          // 0 = no ballast
      })) redrawCard(i);
    };
  }
}

// ---- Exercise actions -------------------------------------------------------------

/** Exercise picker sheet (library + own, search and filters, "+ Nuovo esercizio"). */
function pickExercise(title, onPick) {
  const pf = { q: '', group: '', kind: '' };
  const { box, close } = openSheet('');
  const paint = () => {
    const rows = filterExercises(listExercises(getDoc()), pf);
    box.querySelector('.pk-list').innerHTML = rows.length
      ? rows.map((e) => `<li><button type="button" class="btn" data-ex="${esc(e.id)}"><span style="text-align:left">${esc(e.name)}
          <small class="muted" style="display:block;font-weight:400">${esc(exerciseMeta(e))}</small></span></button></li>`).join('')
      : '<li><span class="muted">Nessun esercizio trovato.</span></li>';
  };
  const build = (focus) => {
    box.innerHTML = `<h2>${esc(title)}</h2>
      <div class="form pk-filters">${filterBar(pf)}</div>
      <button type="button" class="btn" data-act="new">+ Nuovo esercizio</button>
      <ul class="rows pk-list"></ul>`;
    paint();
    bindFilterBar(box.querySelector('.pk-filters'), pf, (full) => (full ? build(false) : paint()));
    if (focus) box.querySelector('.ex-search').focus();
  };
  build(true);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ex) {
      close();
      onPick(b.dataset.ex);
    } else if (b.dataset.act === 'new') {
      close();
      openExerciseSheet({ name: pf.q.trim().slice(0, 40), onSaved: onPick });
    }
  };
}

function addItem(exId) {
  if (!mutate((s) => s.items.push({ ex: exId, group: null, note: '', sets: newSets(getDoc(), exId) }))) return;
  redraw();
  root.querySelector('.ex-card:last-of-type')?.scrollIntoView({ block: 'center' });
}

function replaceItem(i, exId) {
  const ok = mutate((s) => {
    const it = s.items[i];
    if (!it) return;
    const strength = isStrength(shapeOf(resolveExercise(getDoc(), exId)));
    it.sets = newSets(getDoc(), exId, it.sets.filter((x) => !x.w).length || 3);
    it.ex = exId;
    it.note = '';
    if (!strength) {
      delete it.rest;
      it.group = null;
    }
  });
  if (ok) redraw();
}

function move(i, dir) {
  const ok = mutate((s) => {
    const items = s.items;
    const j = i + dir;
    if (!items[i] || !items[j]) return;
    if (items[i].group !== items[j].group) items[i].group = null;   // moving out of / across a superset
    [items[i], items[j]] = [items[j], items[i]];
  });
  if (!ok) return;
  notes = new Set();
  redraw();
}

function removeItem(i) {
  const it = cur()?.items[i];
  if (!it) return;
  const name = resolveExercise(getDoc(), it.ex)?.name ?? 'questo esercizio';
  if (it.sets.some((x) => x.done) && !confirm(`Rimuovere ${name}? Le serie segnate andranno perse.`)) return;
  if (!mutate((s) => { s.items.splice(i, 1); })) return;
  notes = new Set();
  redraw();
}

function openItemMenu(i) {
  const s = cur();
  const it = s?.items[i];
  if (!it) return;
  const ro = isReadOnly();
  const dis = ro ? 'disabled' : '';
  const name = resolveExercise(getDoc(), it.ex)?.name ?? 'Esercizio';
  const { box, close } = openSheet(`<h2>${esc(name)}</h2>
    <button type="button" class="btn" data-m="up" ${i === 0 || ro ? 'disabled' : ''}>↑ Sposta su</button>
    <button type="button" class="btn" data-m="down" ${i === s.items.length - 1 || ro ? 'disabled' : ''}>↓ Sposta giù</button>
    <button type="button" class="btn" data-m="swap" ${dis}>⇄ Sostituisci esercizio</button>
    <button type="button" class="btn" data-m="note" ${dis}>✎ ${it.note ? 'Modifica nota' : 'Aggiungi nota'}</button>
    <button type="button" class="btn danger" data-m="remove" ${dis}>✕ Rimuovi esercizio</button>
    <button type="button" class="btn" data-m="cancel">Annulla</button>`);
  box.onclick = (e) => {
    const b = e.target.closest('button[data-m]');
    if (!b || b.disabled) return;
    const m = b.dataset.m;
    close();
    if (m === 'up' || m === 'down') move(i, m === 'up' ? -1 : 1);
    else if (m === 'swap') pickExercise('Sostituisci esercizio', (id) => replaceItem(i, id));
    else if (m === 'remove') removeItem(i);
    else if (m === 'note') {
      notes.add(i);
      redrawCard(i);
      root.querySelector(`.ex-card[data-i="${i}"] .ex-note`)?.focus();
    }
  };
}

// ---- Session actions -------------------------------------------------------------

function openFinish() {
  const s = cur();
  if (!isLive(s) || isReadOnly()) return;
  const doc = getDoc();
  const tpl = s.tpl ? doc.templates.find((t) => t.id === s.tpl && !t.deleted) : null;
  let rpe = s.rpe ?? null;
  const { box, close } = openSheet(`<h2>Fine allenamento</h2>
    ${summaryHtml(doc, s, Date.now() - s.start)}
    <div class="form">
      <fieldset><legend>Fatica percepita dell’allenamento (RPE)</legend>${rpeChips(rpe, 'frpe', '')}</fieldset>
      <label class="field">Nota<textarea name="note" rows="2" maxlength="500" placeholder="Com’è andata?">${esc(s.note)}</textarea></label>
      ${structureChanged(tpl, s) ? `<label class="switch-row"><span>Aggiornare la scheda con queste modifiche?</span>
        <span class="switch"><input type="checkbox" name="upd" aria-label="Aggiorna la scheda ${esc(tpl.name)}"><span></span></span></label>` : ''}
    </div>
    <button type="button" class="btn primary" data-f="save">Salva</button>
    <button type="button" class="btn center" data-f="cancel">Continua l’allenamento</button>`);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'frpe') {
      const v = +b.dataset.v;
      rpe = rpe === v ? null : v;
      paintChips(box, 'frpe', rpe);
    } else if (b.dataset.f === 'cancel') {
      close();
    } else if (b.dataset.f === 'save') {
      const note = box.querySelector('[name="note"]').value.trim().slice(0, 500);
      finishSession(sid, { rpe, note, updateTemplate: !!box.querySelector('[name="upd"]')?.checked });
      if (isLive(cur())) return;                          // not saved
      close();
      skipRest();
      location.hash = '#oggi';
    }
  };
}

function discard(s) {
  const live = isLive(s);
  if (!confirm(live ? 'Scartare questo allenamento? Non verrà salvato.' : 'Eliminare questo allenamento?')) return;
  if (isReadOnly()) return;
  discardSession(s.id);
  if (live) skipRest();
  location.hash = live ? '#oggi' : dayHash(s.date);
}

// ---- Events ------------------------------------------------------------------------

function onClick(e) {
  unlockAudio();                                        // first gesture after a reload unlocks the beep
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA' || b.disabled) return;
  const s = cur();
  if (!s) return;
  const act = b.dataset.act;
  const i = +(b.closest('.ex-card')?.dataset.i ?? -1);
  const j = +(b.closest('.set-row')?.dataset.j ?? -1);
  if (act === 'finish') openFinish();
  else if (act === 'close') location.hash = dayHash(s.date);
  else if (act === 'discard') discard(s);
  else if (act === 'add') pickExercise('Aggiungi esercizio', addItem);
  else if (act === 'menu') openItemMenu(i);
  else if (act === 'addset' || act === 'addwarm') addSet(i, act === 'addwarm');
  else if (act === 'set') openSetSheet(i, j);
  else if (act === 'inc' || act === 'dec') step(i, j, b.closest('.stepper').dataset.f, act === 'inc' ? 1 : -1);
  else if (act === 'done') toggleDone(i, j);
  else if (act === 'srpe') {
    const v = +b.dataset.v;
    let val = null;
    if (mutate((x) => {
      x.rpe = x.rpe === v ? null : v;
      val = x.rpe;
    })) paintChips(root, 'srpe', val);
  }
}

function onChange(e) {
  const t = e.target;
  const act = t.dataset.act;
  if (act === 'val') commitValue(t);
  else if (act === 'note') {
    const i = +t.closest('.ex-card').dataset.i;
    mutate((s) => { if (s.items[i]) s.items[i].note = t.value.trim().slice(0, 120); });
  } else if (act === 'snote') {
    mutate((s) => { s.note = t.value.trim().slice(0, 500); });
  }
}

/** Value fields select their text on focus; Enter commits (blur fires change). Bound once on <main>. */
function bindOnce(el) {
  if (bound) return;
  bound = true;
  el.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t.matches?.('.set-row input[data-act="val"]')) setTimeout(() => { if (document.activeElement === t) t.select(); }, 0);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('.set-row input, input.ex-note')) e.target.blur();
  });
}

export function render(el, { doc, param, refresh: appRefresh }) {
  root = el;
  refresh = appRefresh ?? refresh;
  bindOnce(el);
  const s = doc.sessions.find((x) => x.id === param && !x.deleted);
  if (!s) {
    keepAwake(false);
    location.replace('#oggi');
    return;
  }
  if (sid !== s.id) {
    sid = s.id;
    notes = new Set();
  }
  keepAwake(isLive(s));
  draw();
}
