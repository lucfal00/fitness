// "Oggi" (#oggi[/AAAA-MM-DD]): day navigation, week strip, schede in progress with their days, open / concluded workouts, body weight.
import {
  todayKey, addDays, weekStart, isConcluded, isDate, workoutLabel, isScheda, usable, schedaDays, schedaGroups, lastDayOf,
  choosableDays, choosableList,
} from '../logic.js';
import { resolveExercise, listActivities, isActivity, activityIcon } from '../library.js';
import { icon } from '../icons.js';
import { isTimed } from '../interval.js';
import { estimateMinutes, sessionVolume, sessionRecords, pace } from '../metrics.js';
import {
  startSession, finishSession, addPastSession, openSessionId, setBody, isReadOnly, getDoc, getSync, exportBackup,
  addActivity, updateActivity, discardSession, saveExercise,
} from '../store.js';
import { unlockAudio, skipRest } from '../timer.js';
import { esc, safeColor, fmtDay, fmtKg, fmtNum, parseNum, fmtFull, fmtKcal, DAY_LETTERS } from '../ui.js';
import { openSheet } from './exercises.js';
import { setCounts, fmtMinutes } from './session-rows.js';
import { sessionKcal, dayKcal } from '../calories.js';

const WEEK_MS = 7 * 864e5;

const tplOf = (doc, id) => (id ? doc.templates.find((t) => t.id === id) ?? null : null);
const sessionHash = (id) => `#sessione/${encodeURIComponent(id)}`;
/** Live timed workouts open in the timer, everything else in the session screen. */
const liveHash = (s) => (s.mode === 'timer' && s.end == null ? `#timer/${encodeURIComponent(s.id)}` : sessionHash(s.id));

/** The activity (cardio / sport exercise) a session records, or null for a workout. */
function activityOf(doc, s) {
  if (s.tpl != null || s.items.length !== 1) return null;
  const ex = resolveExercise(doc, s.items[0].ex);
  return isActivity(ex) ? ex : null;
}

function look(doc, s) {
  const act = activityOf(doc, s);
  if (act) return { name: act.name, mark: icon(activityIcon(act)), color: safeColor(null) };
  const t = tplOf(doc, s.tpl);
  return { name: workoutLabel(doc, s.tpl), mark: esc(t ? t.emoji || '💪' : '🏋️'), color: safeColor(t?.color) };
}

/** Selected day from the route: a valid date (past or future), else today. */
const dayOf = (param, today) => (isDate(param) ? param : today);

const go = (d, today) => location.replace(d === today ? '#oggi' : `#oggi/${d}`);

// ---- Week strip -------------------------------------------------------------------

/** Dots of day d: one per concluded workout, in its colour. */
function dayDots(doc, d) {
  return doc.sessions.filter((s) => isConcluded(s) && s.date === d).sort((a, b) => a.start - b.start)
    .map((s) => safeColor(tplOf(doc, s.tpl)?.color));
}

function weekStrip(doc, day, today) {
  const ws = weekStart(day);
  return `<nav class="week" aria-label="Settimana">${DAY_LETTERS.map((L, k) => {
    const d = addDays(ws, k);
    const dots = dayDots(doc, d);
    const done = dots.length;
    const label = `${fmtDay(d)}${done ? `, ${done} fatt${done === 1 ? 'o' : 'i'}` : ''}`;
    const inner = `${L}<b>${+d.slice(8)}</b><span class="dots">${dots.slice(0, 4)
      .map((c) => `<i class="done" style="--c:${c}"></i>`).join('')}</span>`;
    const cls = `day${d === day ? ' sel' : ''}${d === today ? ' now' : ''}`;
    return `<a class="${cls}${d > today ? ' future' : ''}" href="${d === today ? '#oggi' : `#oggi/${d}`}" aria-label="${esc(label)}"
          ${d === day ? 'aria-current="date"' : ''}>${inner}</a>`;
  }).join('')}</nav>`;
}

// ---- Cards ---------------------------------------------------------------------------

/** Scheda in progress: its days as buttons; the one trained last is marked. `preview` (a future day): the days are
 *  listed without starting anything. */
function schedaCard(doc, p, ro, preview = false) {
  const days = schedaDays(doc, p).filter((t) => usable(doc, t.id));
  const lastId = lastDayOf(doc, p);
  const last = days.find((t) => t.id === lastId);
  const sub = [p.to != null ? `fino al ${fmtFull(p.to)}` : 'in corso', last ? `ultimo: ${last.dayName ?? last.name}` : '']
    .filter(Boolean).join(' · ');
  const btn = (t) => {
    const mins = estimateMinutes(doc, t, doc.settings.rest);
    const n = t.items.length;
    const meta = isTimed(t)
      ? `⏱ A tempo · ${t.rounds ?? 1} ${(t.rounds ?? 1) === 1 ? 'giro' : 'giri'}${mins > 0 ? ` · ${mins} min` : ''}`
      : `${n} ${n === 1 ? 'esercizio' : 'esercizi'}${mins > 0 ? ` · ~${mins} min` : ''}`;
    const body = `<span class="grow"><b>${esc(t.dayName ?? t.name)}</b><small class="muted">${esc(meta)}</small></span>`;
    if (preview) return `<div class="btn choice-btn day-btn preview">${body}</div>`;
    return `<button type="button" class="btn choice-btn day-btn" data-act="start" data-tpl="${esc(t.id)}" ${ro ? 'disabled' : ''}>
      ${body}${t.id === lastId && days.length > 1 ? '<span class="pill">Ultimo fatto</span>' : ''}${days.length === 1 ? '<span class="day-go" aria-hidden="true">▶</span>' : ''}</button>`;
  };
  return `<section class="card tpl-card" style="--c:${safeColor(p.color)}">
    <div class="head"><span class="badge" aria-hidden="true">${esc(p.emoji || '💪')}</span>
      <div class="grow"><b>${esc(p.name)}</b><small class="muted">${esc(sub)}</small></div>
      <a class="btn small" href="#scheda/${encodeURIComponent(p.id)}" aria-label="Modifica ${esc(p.name)}">Modifica</a></div>
    ${days.length ? `${days.length > 1 && !preview ? '<p class="muted day-ask">Che giorno fai?</p>' : ''}<div class="day-btns">${days.map(btn).join('')}</div>`
    : `<p class="muted">Nessun giorno con esercizi: <a href="#scheda/${encodeURIComponent(p.id)}">aggiungili</a>.</p>`}
  </section>`;
}

function openCard(doc, s) {
  const l = look(doc, s);
  const { done, total } = setCounts(s);
  const since = s.date === todayKey() ? `In corso da ${fmtMinutes(Date.now() - s.start)}` : `Aperto dal ${fmtDay(s.date).toLowerCase()}`;
  return `<section class="card tpl-card live" style="--c:${l.color}">
    <div class="head"><span class="badge" aria-hidden="true">${l.mark}</span>
      <div class="grow"><b>${esc(l.name)}</b><small class="muted">${esc(since)} · ${done}/${total} serie</small></div>
      <a class="btn primary" href="${liveHash(s)}">Riprendi</a></div>
  </section>`;
}

function activityCard(doc, s, act) {
  const set = s.items[0].sets[0] ?? {};
  const sec = set.sec ?? Math.round((s.end - s.start) / 1000);
  const p = set.km > 0 && sec > 0 ? pace(sec, set.km) : null;
  const k = sessionKcal(doc, s);
  const meta = [fmtMinutes(sec * 1000), set.km > 0 ? `${fmtKg(set.km)} km` : '', p ? `${p}/km` : '', k ? `${fmtKcal(k.kcal)} kcal` : '']
    .filter(Boolean).join(' · ');
  return `<button type="button" class="card sess-card act-card" data-act="act-edit" data-id="${esc(s.id)}" style="--c:${safeColor(null)}">
    <span class="badge" aria-hidden="true">${icon(activityIcon(act))}</span>
    <span class="grow"><b>${esc(act.name)} <span class="status ok">✓</span></b><small class="muted">${esc(meta)}</small></span>
    <span class="chev" aria-hidden="true">›</span></button>`;
}

function doneCard(doc, s) {
  const act = activityOf(doc, s);
  if (act) return activityCard(doc, s, act);
  const l = look(doc, s);
  const vol = sessionVolume(doc, s);
  const { done, total } = setCounts(s);
  const rec = new Set(sessionRecords(doc, s).records.map((r) => r.ex)).size;
  const k = sessionKcal(doc, s);
  const meta = [fmtMinutes(s.end - s.start), k ? `${fmtKcal(k.kcal)} kcal` : '', vol ? `${fmtNum(vol)} kg` : '', `${done}/${total} serie`,
    rec ? `🏆 ${rec} record` : ''].filter(Boolean).join(' · ');
  return `<a class="card sess-card" href="${sessionHash(s.id)}" style="--c:${l.color}">
    <span class="badge" aria-hidden="true">${l.mark}</span>
    <span class="grow"><b>${esc(l.name)} <span class="status ok">✓</span></b><small class="muted">${esc(meta)}</small></span>
    <span class="chev" aria-hidden="true">›</span></a>`;
}

function weightCard(doc, day, ro) {
  const kg = doc.body[day]?.kg;
  return `<section class="card weight-card">
    <label for="bw"><b>Peso corporeo</b><small class="muted">kg</small></label>
    <input id="bw" type="text" inputmode="decimal" data-act="bw" value="${kg != null ? esc(fmtKg(kg)) : ''}" placeholder="–"
      autocomplete="off" enterkeyhint="done" aria-label="Peso corporeo in kg" ${ro ? 'disabled' : ''}>
    <a class="btn small" href="#corpo">Misure</a>
  </section>`;
}

function backupNotice(doc) {
  const hasData = doc.sessions.some((s) => !s.deleted) || doc.templates.some((t) => !t.deleted);
  const last = doc.settings.lastBackup || 0;
  if (!hasData || getSync().connected || Date.now() - last <= WEEK_MS) return '';
  return last
    ? `<div class="card notice"><p>Non fai un backup da più di 7 giorni.</p>
        <button type="button" class="btn" data-act="backup">Esporta</button></div>`
    : `<div class="card notice"><p>I tuoi dati sono solo su questo dispositivo: collega la sincronizzazione o esporta un backup.</p>
        <a class="btn" href="#impostazioni">Impostazioni</a></div>`;
}

// ---- Sheets -----------------------------------------------------------------------------

// ---- Activities ------------------------------------------------------------------------

const QUICK_MIN = [15, 30, 45, 60, 90];
const DEC = /^\d+([.,]\d+)?$/;

/** "Aggiungi attività": cardio and sport in one list; a tap opens the form. */
function openActivityPicker(day) {
  const doc = getDoc();
  const list = listActivities(doc);
  const row = (attrs, ic, name, chev = true) => `<li><button type="button" class="act-row" ${attrs}>${icon(ic)}<span class="grow">${name}</span>
    ${chev ? icon('chevron-right', 'ic chev') : ''}</button></li>`;
  const { box, close } = openSheet(`<h2>Aggiungi attività</h2>
    <ul class="act-list">${list.map((ex) => row(`data-ex="${esc(ex.id)}"`, activityIcon(ex), esc(ex.name))).join('')}
      ${row('data-act="new"', 'plus', 'Nuova attività', false).replace('act-row', 'act-row act-new')}</ul>
    <button type="button" class="btn center" data-act="cancel">Annulla</button>`);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    close();
    if (b.dataset.ex) openActivityForm(day, resolveExercise(getDoc(), b.dataset.ex));
    else if (b.dataset.act === 'new') openNewActivity(day);
  };
}

/** A new activity (own exercise): name and whether it has a distance (cardio) or not (sport); then its form. */
function openNewActivity(day) {
  const { box, close } = openSheet(`<h2>Nuova attività</h2>
    <form class="form" novalidate>
      <label class="field">Nome<input name="name" maxlength="40" placeholder="Es. Sci di fondo" autocomplete="off"></label>
      <fieldset><legend>Si misura anche la distanza?</legend>
        <div class="seg"><label class="pick"><input type="radio" name="kind" value="cardio" checked><span>Sì, con i km</span></label>
          <label class="pick"><input type="radio" name="kind" value="sport"><span>No, solo la durata</span></label></div>
      </fieldset>
      <p class="error" role="alert" hidden></p>
      <button class="btn primary center" type="submit">Continua</button>
      <button class="btn center" type="button" data-act="cancel">Annulla</button>
    </form>`);
  const form = box.querySelector('form');
  form.querySelector('[data-act=cancel]').onclick = close;
  form.name.focus();
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const err = form.querySelector('.error');
    if (!name) { err.textContent = 'Scrivi il nome dell’attività.'; err.hidden = false; return; }
    const id = saveExercise({ name, kind: form.kind.value, group: null, also: [] });
    if (id == null) { err.textContent = 'Modalità sola lettura: impossibile salvare.'; err.hidden = false; return; }
    close();
    openActivityForm(day, resolveExercise(getDoc(), id));
  };
}

/** Duration (minutes), km (cardio only) and note; with `s` it edits / deletes that activity. */
function openActivityForm(day, ex, s = null) {
  if (!ex) return;
  const set = s?.items[0]?.sets[0] ?? {};
  const min = s ? Math.round((set.sec ?? (s.end - s.start) / 1000) / 60) : '';
  const km = set.km > 0 ? fmtKg(set.km) : '';
  const withKm = ex.kind === 'cardio';
  const { box, close } = openSheet(`<h2 class="act-title">${icon(activityIcon(ex))}${esc(ex.name)}</h2>
    <p class="muted act-day">${esc(fmtDay(s ? s.date : day))}</p>
    <form class="form" novalidate>
      <fieldset><legend>Durata</legend>
        <div class="dur"><button type="button" class="dur-btn" data-step="-5" aria-label="5 minuti in meno">−</button>
          <label class="dur-val"><input name="min" type="text" inputmode="numeric" value="${esc(min)}" placeholder="30" autocomplete="off"
            aria-label="Durata in minuti"><span>min</span></label>
          <button type="button" class="dur-btn" data-step="5" aria-label="5 minuti in più">+</button></div>
        <div class="quick-min">${QUICK_MIN.map((m) => `<button type="button" class="qchip${+min === m ? ' on' : ''}" data-min="${m}">${m}</button>`).join('')}</div>
      </fieldset>
      ${withKm ? `<label class="field">Distanza (km, facoltativa)<input name="km" type="text" inputmode="decimal" value="${esc(km)}" placeholder="es. 5" autocomplete="off"></label>` : ''}
      <label class="field">Nota (facoltativa)<input name="note" type="text" maxlength="200" value="${esc(s?.note ?? '')}" autocomplete="off"></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn primary center" type="submit">Salva</button>
      ${s ? '<button class="btn danger center" type="button" data-act="del">Elimina</button>' : ''}
      <button class="btn center" type="button" data-act="cancel">Annulla</button>
    </form>`);
  const form = box.querySelector('form');
  const err = (m) => {
    const p = form.querySelector('.error');
    p.textContent = m;
    p.hidden = false;
  };
  form.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.min || b.dataset.step) {
      const cur = parseInt(form.min.value, 10) || 0;
      const v = b.dataset.min ? +b.dataset.min : Math.min(600, Math.max(5, cur + +b.dataset.step));
      form.min.value = v;
      form.querySelectorAll('.qchip').forEach((c) => c.classList.toggle('on', +c.dataset.min === v));
    } else if (b.dataset.act === 'cancel') close();
    else if (b.dataset.act === 'del' && confirm(`Eliminare ${ex.name}?`)) {
      discardSession(s.id);
      close();
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const m = form.min.value.trim();
    if (!/^\d+$/.test(m) || +m < 1 || +m > 600) { err('Inserisci una durata da 1 a 600 minuti.'); return; }
    const k = withKm ? form.km.value.trim() : '';
    if (k && (!DEC.test(k) || parseNum(k) <= 0 || parseNum(k) > 500)) { err('La distanza deve essere un numero di km maggiore di 0.'); return; }
    const fields = { sec: +m * 60, km: k ? Math.round(parseNum(k) * 100) / 100 : null, note: form.note.value.trim() };
    if (isReadOnly()) { err('Modalità sola lettura: impossibile salvare.'); return; }
    if (s) updateActivity(s.id, fields);
    else addActivity({ date: day, ex: ex.id, ...fields });
    close();
  };
}

function begin(tpl) {
  const id = startSession({ date: todayKey(), tpl });
  if (id != null) location.hash = liveHash(getDoc().sessions.find((s) => s.id === id));
}

/** Start a live workout; with one already open on this device: resume it or finish it first. */
function start(tpl) {
  unlockAudio();                                   // tap on "Inizia" unlocks the rest beep
  if (isReadOnly()) return;
  const openId = openSessionId();
  if (!openId) {
    begin(tpl);
    return;
  }
  const doc = getDoc();
  const s = doc.sessions.find((x) => x.id === openId);
  const l = look(doc, s);
  const { box, close } = openSheet(`<h2>Hai un allenamento in corso</h2>
    <p class="muted">${esc(l.name)} · iniziato ${s.date === todayKey() ? `${fmtMinutes(Date.now() - s.start)} fa` : `il ${esc(fmtDay(s.date).toLowerCase())}`}</p>
    <button type="button" class="btn primary center" data-m="resume">Riprendi</button>
    <button type="button" class="btn center" data-m="end">Termina quello aperto e inizia</button>
    <button type="button" class="btn center" data-m="cancel">Annulla</button>`);
  box.onclick = (e) => {
    const m = e.target.closest('button[data-m]')?.dataset.m;
    if (!m) return;
    close();
    if (m === 'resume') location.hash = liveHash(s);
    else if (m === 'end') {
      finishSession(openId, {});
      skipRest();
      begin(tpl);
    }
  };
}

/** Past day: template (or free) + minutes, then the created (concluded) session opens for editing. */
function openAddPast(doc, day, today, preset = null) {
  const list = choosableList(doc, today, { withConcluded: true });      // a past workout may belong to a concluded scheda
  const sel = preset && list.some((t) => t.id === preset) ? preset : '';
  const minsOf = (id) => {
    const t = list.find((x) => x.id === id);
    const m = t ? estimateMinutes(doc, t, doc.settings.rest) : 0;
    return m > 0 ? m : 60;
  };
  const opt = (id, emoji, name, color) => `<label class="choice"><input type="radio" name="tpl" value="${esc(id)}" ${id === sel ? 'checked' : ''}>
    <span class="badge" style="--c:${color}" aria-hidden="true">${esc(emoji)}</span><span>${esc(name)}</span></label>`;
  const { box, close } = openSheet(`<h2>Aggiungi allenamento</h2>
    <p class="muted">${esc(fmtDay(day))}</p>
    <form class="form" novalidate>
      <fieldset><legend>Scheda</legend>
        ${list.map((t) => opt(t.id, t.emoji || '💪', workoutLabel(doc, t.id), safeColor(t.color))).join('')}
        ${opt('', '🏋️', 'Allenamento libero', safeColor(null))}
      </fieldset>
      <label class="field">Durata (minuti)<input name="min" type="text" inputmode="numeric" value="${minsOf(sel)}" autocomplete="off"></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn primary center" type="submit">Aggiungi</button>
      <button class="btn center" type="button" data-act="cancel">Annulla</button>
    </form>`);
  const form = box.querySelector('form');
  let touched = false;
  form.min.oninput = () => { touched = true; };
  form.onchange = (e) => {
    if (e.target.name === 'tpl' && !touched) form.min.value = minsOf(e.target.value);
  };
  form.querySelector('[data-act="cancel"]').onclick = close;
  form.onsubmit = (e) => {
    e.preventDefault();
    const err = form.querySelector('.error');
    const min = Number(form.min.value.trim());
    if (!/^\d+$/.test(form.min.value.trim()) || min < 1 || min > 600) {
      err.textContent = 'Inserisci una durata da 1 a 600 minuti.';
      err.hidden = false;
      return;
    }
    const tpl = form.querySelector('[name="tpl"]:checked')?.value || null;
    const id = addPastSession({ date: day, tpl, minutes: min });
    if (id == null) {
      err.textContent = 'Modalità sola lettura: impossibile salvare.';
      err.hidden = false;
      return;
    }
    close();
    location.hash = sessionHash(id);
  };
}

// ---- Render --------------------------------------------------------------------------------

export function render(el, { doc, param, today }) {
  const day = dayOf(param, today);
  const ro = isReadOnly();
  const isToday = day === today;
  const future = day > today;
  const title = isToday ? 'Oggi' : day === addDays(today, -1) ? 'Ieri' : day === addDays(today, 1) ? 'Domani' : fmtDay(day).split(' ')[0];
  const openSessions = doc.sessions.filter((s) => !s.deleted && s.end == null).sort((a, b) => b.start - a.start);
  const doneToday = doc.sessions.filter((s) => isConcluded(s) && s.date === day).sort((a, b) => a.start - b.start);
  const { running } = schedaGroups(doc, today);
  const anyScheda = doc.programs.some(isScheda);
  const kcal = future ? null : dayKcal(doc, day);

  let main = '';
  if (isToday && !anyScheda) {
    main = `<div class="card empty"><p>Nessuna scheda ancora.</p>
      <p class="muted">Crea una scheda con i tuoi giorni di allenamento (Giorno 1, 2, 3…) e il suo periodo.</p>
      <div class="btn-row center"><a class="btn primary" href="#scheda/nuova">Crea la tua prima scheda</a>
      <button type="button" class="btn" data-act="pick" ${ro ? 'disabled' : ''}>Aggiungi attività</button></div></div>`;
  } else if (isToday) {
    main = running.map((p) => schedaCard(doc, p, ro)).join('');
    if (!running.length) {
      main = `<section class="card rest-card"><div class="head"><span class="badge" aria-hidden="true">😴</span>
        <div class="grow"><b>Nessuna scheda in corso</b><small class="muted">Controlla le date delle tue schede.</small></div></div>
        <div class="card-actions"><a class="btn" href="#schede">Vai alle schede</a></div></section>`;
    }
    main += `<button type="button" class="btn block other-btn" data-act="pick" ${ro ? 'disabled' : ''}>+ Attività: corsa, bici, sport…</button>`;
  } else if (future) {                             // a day ahead: what will be in progress, nothing to start yet
    const later = schedaGroups(doc, day).running;
    main = later.length
      ? `${later.map((p) => schedaCard(doc, p, ro, true)).join('')}<p class="muted center-note">Potrai iniziare l’allenamento quel giorno.</p>`
      : `<section class="card rest-card"><div class="head"><span class="badge" aria-hidden="true">📅</span>
        <div class="grow"><b>Nessuna scheda in corso</b><small class="muted">In questo giorno non c’è una scheda attiva.</small></div></div></section>`;
  }

  el.innerHTML = `
    <header class="top">
      <button type="button" class="icon-btn" data-act="prev" aria-label="Giorno precedente">‹</button>
      <div class="grow"><h1>${esc(title)}</h1><small>${esc(fmtDay(day))}${kcal ? ` · <a href="#progressi" class="kcal-link">≈ ${fmtKcal(kcal.total)} kcal</a>` : ''}</small></div>
      ${isToday ? '' : '<button type="button" class="btn small today-btn" data-act="today" aria-label="Torna a oggi">Oggi</button>'}
      <button type="button" class="icon-btn" data-act="next" aria-label="Giorno successivo">›</button>
    </header>
    ${weekStrip(doc, day, today)}
    ${backupNotice(doc)}
    ${openSessions.map((s) => openCard(doc, s)).join('')}
    ${main}
    ${doneToday.length ? `<h2 class="list-title">${isToday ? 'Fatti oggi' : 'Allenamenti fatti'}</h2>${doneToday.map((s) => doneCard(doc, s)).join('')}` : ''}
    ${isToday || future ? '' : `<div class="btn-row past-add"><button type="button" class="btn" data-act="addpast" ${ro ? 'disabled' : ''}>+ Allenamento della scheda</button>
      <button type="button" class="btn" data-act="pick" ${ro ? 'disabled' : ''}>+ Attività</button></div>`}
    ${future ? '' : weightCard(doc, day, ro)}`;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT' || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'prev') go(addDays(day, -1), today);
    else if (act === 'next') go(addDays(day, 1), today);
    else if (act === 'today') go(today, today);
    else if (act === 'start') start(b.dataset.tpl);
    else if (act === 'pick') openActivityPicker(day);
    else if (act === 'act-edit') {
      const s = getDoc().sessions.find((x) => x.id === b.dataset.id);
      if (s) openActivityForm(day, resolveExercise(getDoc(), s.items[0]?.ex), s);
    } else if (act === 'addpast') openAddPast(doc, day, today, b.dataset.tpl ?? null);
    else if (act === 'backup') {
      try { await exportBackup(); } catch { /* retry from Impostazioni */ }
    }
  };

  el.onchange = (e) => {
    if (e.target.dataset.act !== 'bw') return;
    const t = e.target.value.trim();
    const v = parseNum(t);
    if (!t) setBody(day, { kg: null });
    else if (/^\d+([.,]\d+)?$/.test(t) && v >= 20 && v <= 400) setBody(day, { kg: Math.round(v * 100) / 100 });
    else e.target.value = doc.body[day]?.kg != null ? fmtKg(doc.body[day].kg) : '';
  };
  const bw = el.querySelector('#bw');
  if (bw) bw.onkeydown = (e) => { if (e.key === 'Enter') bw.blur(); };
}
