// "Calendario" (#calendario[/AAAA-MM]): month grid with planned / done workouts, day sheet, active scheda box.
import {
  planned, isPlannedDone, addDays, addMonths, monthStart, monthEnd, weekStart, isConcluded, fromKey, toKey, activeProgram,
  workoutLabel, schedaOf,
} from '../logic.js';
import {
  getDoc, onChange, setPlan, movePlanned, addPastSession, isReadOnly,
} from '../store.js';
import {
  esc, safeColor, fmtDay, fmtFull, DAY_LETTERS, DAY_SHORT,
} from '../ui.js';
import { openSheet } from './exercises.js';
import { isScheda, schedaMeta, isConcludedScheda } from './templates.js';

const FULL_MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto',
  'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const tplOf = (doc, id) => (id ? doc.templates.find((t) => t.id === id) ?? null : null);
/** Days one can plan: live templates, those of concluded schede left out. */
const liveTemplates = (doc, today) => doc.templates.filter((t) => {
  if (t.deleted || t.archived) return false;
  const p = schedaOf(doc, t.id);
  return !p || !isConcludedScheda(p, today);
}).sort((a, b) => a.order - b.order);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toKey(fromKey(s)) === s;

/** Month key (first day) from the route, else the current month. */
function monthOf(param, today) {
  const m = /^(\d{4})-(\d{2})$/.exec(param);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${param}-01` : monthStart(today);
}

/** Rows of buttons (data-tpl) to choose a day ("Scheda · Giorno"). */
function pickerRows(doc, today) {
  const list = liveTemplates(doc, today);
  if (!list.length) return '<li><span class="muted">Nessuna scheda disponibile.</span></li>';
  return list.map((t) => `<li><button type="button" class="btn" data-tpl="${esc(t.id)}">
    <span class="badge" style="--c:${safeColor(t.color)}">${esc(t.emoji || '💪')}</span><span>${esc(workoutLabel(doc, t.id))}</span></button></li>`).join('');
}

// ---- Month grid ---------------------------------------------------------------

/** Dots of day d: planned (outline) and done (filled), matched by template. */
function dayDots(doc, d, today) {
  const left = doc.sessions.filter((s) => isConcluded(s) && s.date === d);
  const p = planned(doc, d, today);
  const color = (id) => safeColor(tplOf(doc, id)?.color);
  const dots = [];
  for (const id of p.items) {
    const k = left.findIndex((s) => s.tpl === id);
    dots.push({ c: color(id), done: k >= 0 });
    if (k >= 0) left.splice(k, 1);
  }
  for (let n = p.items.length; n < p.count; n++) {          // past rotation days: only the number is known
    const s = left.shift();
    dots.push({ c: color(s?.tpl), done: !!s });
  }
  for (const s of left) dots.push({ c: color(s.tpl), done: true });
  return dots;
}

function monthGrid(doc, ms, today) {
  const first = weekStart(ms);
  const last = addDays(weekStart(monthEnd(ms)), 6);
  const cells = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const dots = dayDots(doc, d, today);
    const plannedN = dots.filter((x) => !x.done).length;
    const doneN = dots.length - plannedN;
    const info = [plannedN ? `${plannedN} previst${plannedN === 1 ? 'o' : 'i'}` : '', doneN ? `${doneN} fatt${doneN === 1 ? 'o' : 'i'}` : '']
      .filter(Boolean).join(', ');
    cells.push(`<button type="button" class="cell ${d.slice(0, 7) === ms.slice(0, 7) ? '' : 'out'} ${d === today ? 'now' : ''}"
      data-d="${d}" aria-label="${esc(fmtDay(d))}${info ? `, ${info}` : ''}"${d === today ? ' aria-current="date"' : ''}>
      <span>${+d.slice(8)}</span>
      <span class="dots">${dots.map((x) => `<i class="${x.done ? 'done' : ''}" style="--c:${x.c}"></i>`).join('')}</span></button>`);
  }
  return `<div class="cal">${DAY_LETTERS.map((L, k) => `<div class="dow" aria-label="${DAY_SHORT[k]}">${L}</div>`).join('')}${cells.join('')}</div>`;
}

// ---- Day sheet ----------------------------------------------------------------

// The open day sheet closes when sync/import replaces the data (its item indexes would be stale).
let closeOpenDay = null;
onChange((e) => {
  if (closeOpenDay && (e.detail?.kind === 'sync' || e.detail?.kind === 'import')) closeOpenDay();
});

function openDay(d, today) {
  closeOpenDay?.();
  let mode = { t: 'main' };
  let closed = false;
  const sheet = openSheet('');
  const { box } = sheet;
  const close = () => {
    if (closed) return;
    closed = true;
    removeEventListener('hashchange', onHash);                      // eslint-disable-line no-use-before-define
    if (closeOpenDay === close) closeOpenDay = null;
    if (box.isConnected) sheet.close();                              // Escape/backdrop already removed it
  };
  function onHash() {                                                // navigating away closes the sheet
    removeEventListener('hashchange', onHash);
    close();
  }
  addEventListener('hashchange', onHash);
  closeOpenDay = close;

  const back = '<button type="button" class="btn" data-act="back">Indietro</button>';
  const nameOf = (doc, id) => (tplOf(doc, id) ? workoutLabel(doc, id) : 'Scheda rimossa');

  function main(doc, ro) {
    const p = planned(doc, d, today);
    const dis = ro ? 'disabled' : '';
    const past = d < today;
    const items = p.items.map((id, i) => `<li data-i="${i}">
        <div class="grow"><b>${esc(nameOf(doc, id))}</b>
          <small class="muted">${isPlannedDone(doc, d, id) ? '✓ Fatto' : 'Previsto'}</small></div>
        <div class="btn-row">
          <button type="button" class="btn small" data-act="move" data-i="${i}" ${dis}>Sposta</button>
          <button type="button" class="btn small" data-act="replace" data-i="${i}" ${dis}>Sostituisci</button>
          <button type="button" class="btn small" data-act="skip" data-i="${i}" ${dis}>Salta</button></div></li>`);
    for (let n = p.items.length; n < p.count; n++) {
      items.push('<li><div class="grow"><b>Allenamento previsto (rotazione)</b></div></li>');
    }
    const done = doc.sessions.filter((s) => isConcluded(s) && s.date === d).sort((a, b) => a.start - b.start);
    const mins = (s) => Math.max(1, Math.round((s.end - s.start) / 60000));
    const skipped = doc.plan[d]?.items != null && p.count === 0;
    return `<h2>${esc(fmtDay(d))}</h2>
      ${skipped ? '<p class="muted">Giorno senza allenamenti previsti (modificato).</p>' : ''}
      ${items.length ? `<ul class="rows">${items.join('')}</ul>` : '<p class="muted">Nessun allenamento previsto.</p>'}
      <button type="button" class="btn" data-act="add" ${dis}>+ Aggiungi allenamento previsto</button>
      ${doc.plan[d]?.items != null ? `<button type="button" class="btn" data-act="restore" ${dis}>Ripristina programma</button>` : ''}
      ${done.length ? `<h2 style="margin-top:16px">Fatti</h2><ul class="rows">${done.map((s) => `<li><a class="row" href="#sessione/${encodeURIComponent(s.id)}">
        <span><b>${esc(s.tpl ? nameOf(doc, s.tpl) : 'Allenamento libero')}</b><small>${mins(s)} min</small></span></a></li>`).join('')}</ul>` : ''}
      ${past ? `<button type="button" class="btn" data-act="past" ${dis}>Aggiungi allenamento svolto</button>` : ''}
      <button type="button" class="btn primary center" data-act="close">Chiudi</button>`;
  }

  function draw() {
    const doc = getDoc();
    const ro = isReadOnly();
    const m = mode;
    if (m.t === 'main') box.innerHTML = main(doc, ro);
    else if (m.t === 'move') {
      box.innerHTML = `<h2>Sposta ${esc(nameOf(doc, m.id))}</h2>
        <div class="form"><label class="field">Nuova data<input type="date" name="to" value="${addDays(d, 1)}"></label>
        <p class="error" role="alert" hidden></p></div>
        <button type="button" class="btn primary center" data-act="domove">Sposta</button>${back}`;
    } else if (m.t === 'replace' || m.t === 'add') {
      box.innerHTML = `<h2>${m.t === 'add' ? 'Aggiungi scheda' : `Sostituisci ${esc(nameOf(doc, m.id))}`}</h2>
        <ul class="rows">${pickerRows(doc, today)}</ul>${back}`;
    } else if (m.t === 'past') {
      box.innerHTML = `<h2>Aggiungi allenamento svolto</h2>
        <div class="form"><label class="field">Scheda<select name="tpl"><option value="">Allenamento libero</option>
          ${liveTemplates(doc, today).map((t) => `<option value="${esc(t.id)}">${esc(workoutLabel(doc, t.id))}</option>`).join('')}</select></label>
        <label class="field">Durata (minuti)<input type="text" inputmode="numeric" name="min" value="60" autocomplete="off"></label>
        <p class="error" role="alert" hidden></p></div>
        <button type="button" class="btn primary center" data-act="dopast">Aggiungi</button>${back}`;
    }
    box.querySelector('input, select, button')?.focus();
  }
  const go = (t) => { mode = { t }; draw(); };
  const err = (msg) => {
    const p = box.querySelector('.error');
    p.textContent = msg;
    p.hidden = false;
  };

  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const doc = getDoc();
    const p = planned(doc, d, today);
    const i = +b.dataset.i;
    const { act } = b.dataset;
    if (b.dataset.tpl) {
      const items = [...p.items];
      if (mode.t === 'replace') items[mode.i] = b.dataset.tpl;
      else items.push(b.dataset.tpl);
      setPlan(d, items);
      go('main');
    } else if (act === 'close') close();
    else if (act === 'back') go('main');
    else if (act === 'move') { mode = { t: 'move', id: p.items[i] }; draw(); }
    else if (act === 'replace') { mode = { t: 'replace', id: p.items[i], i }; draw(); }
    else if (act === 'add') go('add');
    else if (act === 'skip') {
      setPlan(d, p.items.filter((_, k) => k !== i));
      draw();
    } else if (act === 'restore') {
      setPlan(d, null);
      draw();
    } else if (act === 'past') go('past');
    else if (act === 'domove') {
      const to = box.querySelector('[name=to]').value;
      if (!isDate(to)) { err('Scegli una data valida.'); return; }
      if (to === d) { err('Scegli un giorno diverso.'); return; }
      movePlanned(d, to, mode.id);
      go('main');
    } else if (act === 'dopast') {
      const raw = box.querySelector('[name=min]').value.trim();
      const minutes = Number(raw);
      if (!/^\d+$/.test(raw) || minutes < 1 || minutes > 600) { err('Durata da 1 a 600 minuti.'); return; }
      const id = addPastSession({ date: d, tpl: box.querySelector('[name=tpl]').value || null, minutes });
      if (id == null) { err('Modalità sola lettura: impossibile salvare.'); return; }
      close();
      location.hash = `#sessione/${encodeURIComponent(id)}`;
    }
  };
  draw();
}

// ---- Active scheda ------------------------------------------------------------

/** Box under the month: the running scheda with a link to it, or an invitation to pick one. */
function activeBox(doc, today) {
  const p = activeProgram(doc, today);
  if (!p) {
    return `<h2 class="list-title">Scheda attiva</h2>
      <div class="card"><p class="muted" style="margin:0 0 12px">Nessuna scheda attiva.</p>
        <a class="btn block" href="#schede">Vai alle schede</a></div>`;
  }
  if (!isScheda(p)) {                                        // older program without an editing screen
    return `<h2 class="list-title">Scheda attiva</h2>
      <div class="card"><b>${esc(p.name)}</b><small class="muted" style="display:block">Programma precedente (non modificabile)</small></div>`;
  }
  const names = p.days?.length ? `Giorni preferiti: ${p.days.map((g) => DAY_SHORT[g - 1]).join(', ')}` : 'Senza giorni fissi: scegli da Oggi';
  return `<h2 class="list-title">Scheda attiva</h2>
    <a class="card prog-card active sched-box" href="#scheda/${encodeURIComponent(p.id)}" style="--c:${safeColor(p.color)}">
      <span class="badge" aria-hidden="true">${esc(p.emoji || '💪')}</span>
      <span class="grow"><b>${esc(p.name)}</b><small class="muted">${esc(schedaMeta(doc, p))}</small>
        <small class="muted">${esc(names)} · dal ${esc(fmtFull(p.from))}</small></span>
      <span class="chev" aria-hidden="true">›</span></a>`;
}

// ---- View ---------------------------------------------------------------------

export function render(el, { doc, param, today }) {
  const ms = monthOf(param, today);
  const link = (m) => `#calendario/${m.slice(0, 7)}`;
  el.innerHTML = `
    <header class="top"><div class="grow"><h1>Calendario</h1></div>
      ${ms === monthStart(today) ? '' : '<a class="btn today-btn" href="#calendario">Oggi</a>'}</header>
    <nav class="period-nav" aria-label="Mese">
      <a class="icon-btn nav-arrow" href="${link(addMonths(ms, -1))}" aria-label="Mese precedente">‹</a>
      <b>${FULL_MONTHS[+ms.slice(5, 7) - 1]} ${ms.slice(0, 4)}</b>
      <a class="icon-btn nav-arrow" href="${link(addMonths(ms, 1))}" aria-label="Mese successivo">›</a></nav>
    ${monthGrid(doc, ms, today)}
    <p class="legend"><span><i style="border:2px solid var(--accent);border-radius:50%"></i>Previsto</span>
      <span><i style="background:var(--accent);border-radius:50%"></i>Fatto</span></p>
    ${activeBox(doc, today)}`;

  el.onclick = (e) => {
    const cell = e.target.closest('button[data-d]');
    if (cell) openDay(cell.dataset.d, today);
  };
}
