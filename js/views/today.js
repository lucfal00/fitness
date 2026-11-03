// "Oggi" (#oggi[/AAAA-MM-DD]): week strip, schede in progress with their days, open / concluded workouts, body weight.
import {
  todayKey, addDays, weekStart, isConcluded, isDate, workoutLabel, isScheda, usable, schedaDays, schedaGroups, lastDayOf,
  choosableDays, choosableList,
} from '../logic.js';
import { resolveExercise, listActivities, isActivity, activityIcon } from '../library.js';
import { icon } from '../icons.js';
import { isTimed } from '../interval.js';
import { estimateMinutes, sessionVolume, sessionRecords, pace, bodyWeightAt } from '../metrics.js';
import {
  startSession, finishSession, addPastSession, openSessionId, setBody, isReadOnly, getDoc, getSync, exportBackup,
  addActivity, updateActivity, discardSession, saveExercise,
} from '../store.js';
import { unlockAudio, skipRest } from '../timer.js';
import { esc, safeColor, fmtDay, fmtKg, fmtNum, parseNum, fmtFull, fmtKcal, DAY_LETTERS } from '../ui.js';
import { openSheet } from './exercises.js';
import { setCounts, fmtMinutes } from './session-rows.js';
import { sessionKcal, dayKcal, templateKcal } from '../calories.js';

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

/** Week of `day`: a circle per day (the selected one ringed, today in accent) with a dot under days with a workout;
 *  the arrows move by a week. */
function weekStrip(doc, day, today) {
  const ws = weekStart(day);
  const days = DAY_LETTERS.map((L, k) => {
    const d = addDays(ws, k);
    const done = doc.sessions.filter((s) => isConcluded(s) && s.date === d).length;
    const label = `${fmtDay(d)}${done ? `, ${done} fatt${done === 1 ? 'o' : 'i'}` : ''}`;
    const cls = `day${d === day ? ' sel' : ''}${d === today ? ' now' : ''}${d > today ? ' future' : ''}`;
    return `<a class="${cls}" href="${d === today ? '#oggi' : `#oggi/${d}`}" aria-label="${esc(label)}" ${d === day ? 'aria-current="date"' : ''}>
      ${L}<b>${+d.slice(8)}</b><i class="${done ? 'done' : ''}"></i></a>`;
  }).join('');
  return `<nav class="week" aria-label="Settimana">
    <button type="button" class="wk-nav" data-act="prev" aria-label="Settimana precedente">‹</button>${days}
    <button type="button" class="wk-nav" data-act="next" aria-label="Settimana successiva">›</button></nav>`;
}

// ---- Cards and rows ---------------------------------------------------------------------

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

/** "A tempo · 3 giri · 32 min · ≈ 143 kcal" / "5 esercizi · ~45 min · ≈ 230 kcal" for a day of a scheda done on `day`. */
function dayMeta(doc, t, day) {
  const mins = estimateMinutes(doc, t, doc.settings.rest);
  const k = templateKcal(doc, t, day);
  const n = t.items.length;
  const r = t.rounds ?? 1;
  return [...(isTimed(t) ? ['A tempo', `${r} ${r === 1 ? 'giro' : 'giri'}`, mins > 0 ? `${mins} min` : '']
    : [`${n} ${n === 1 ? 'esercizio' : 'esercizi'}`, mins > 0 ? `~${mins} min` : '']), k ? `≈ ${fmtKcal(k)} kcal` : '']
    .filter(Boolean).join(' · ');
}

/** Scheda in progress. One day: its duration and kcal and a single "Inizia"; several: one row per day, the last one
 *  done marked. `preview` (a future day): nothing to start. */
function schedaCard(doc, p, ro, day, preview = false) {
  const days = schedaDays(doc, p).filter((t) => usable(doc, t.id));
  const lastId = lastDayOf(doc, p);
  const head = `<div class="sc-head"><span class="lbl">${preview ? 'Scheda' : 'Scheda in corso'}</span>
      <a class="sc-edit" href="#scheda/${encodeURIComponent(p.id)}" aria-label="Modifica ${esc(p.name)}">Modifica</a></div>
    <h2 class="sc-name">${esc(p.name)}</h2>`;
  let body;
  if (!days.length) {
    body = `<p class="muted sc-meta">Nessun giorno con esercizi: <a href="#scheda/${encodeURIComponent(p.id)}">aggiungili</a>.</p>`;
  } else if (days.length === 1) {
    const t = days[0];
    body = `<p class="muted sc-meta">${esc(dayMeta(doc, t, day))}</p>
      ${preview ? '' : `<button type="button" class="btn primary block sc-go" data-act="start" data-tpl="${esc(t.id)}" ${ro ? 'disabled' : ''}>${PLAY}Inizia</button>`}`;
  } else {
    const row = (t) => {
      const inner = `<span class="grow"><b>${esc(t.dayName ?? t.name)}</b><small>${esc(dayMeta(doc, t, day))}</small></span>
        ${t.id === lastId ? '<span class="pill">Ultimo fatto</span>' : ''}`;
      return preview ? `<li><div class="sc-day">${inner}</div></li>`
        : `<li><button type="button" class="sc-day" data-act="start" data-tpl="${esc(t.id)}" ${ro ? 'disabled' : ''}>${inner}<span class="sc-play">${PLAY}</span></button></li>`;
    };
    body = `${preview ? '' : '<p class="muted sc-meta">Che giorno fai?</p>'}<ul class="sc-days">${days.map(row).join('')}</ul>`;
  }
  const until = p.to != null ? `<p class="muted sc-until">Fino al ${esc(fmtFull(p.to))}</p>` : '';
  return `<section class="card sc-card">${head}${until}${body}</section>`;
}

function openCard(doc, s) {
  const l = look(doc, s);
  const { done, total } = setCounts(s);
  const since = s.date === todayKey() ? `In corso da ${fmtMinutes(Date.now() - s.start)}` : `Aperto dal ${fmtDay(s.date).toLowerCase()}`;
  return `<section class="card sc-card">
    <div class="sc-head"><span class="lbl">In corso</span></div>
    <h2 class="sc-name">${esc(l.name)}</h2>
    <p class="muted sc-meta">${esc(since)} · ${done}/${total} serie</p>
    <a class="btn primary block sc-go" href="${liveHash(s)}">${PLAY}Riprendi</a>
  </section>`;
}

/** A concluded workout or activity: mark, name, what it was (with kcal), a check. Activities open their form. */
function doneRow(doc, s) {
  const l = look(doc, s);
  const k = sessionKcal(doc, s);
  const act = activityOf(doc, s);
  let meta;
  if (act) {
    const set = s.items[0].sets[0] ?? {};
    const sec = set.sec ?? Math.round((s.end - s.start) / 1000);
    const p = set.km > 0 && sec > 0 ? pace(sec, set.km) : null;
    meta = [fmtMinutes(sec * 1000), set.km > 0 ? `${fmtKg(set.km)} km` : '', p ? `${p}/km` : ''];
  } else {
    const vol = sessionVolume(doc, s);
    const { done, total } = setCounts(s);
    const rec = new Set(sessionRecords(doc, s).records.map((r) => r.ex)).size;
    meta = [fmtMinutes(s.end - s.start), vol ? `${fmtNum(vol)} kg` : '', `${done}/${total} serie`, rec ? `${rec} record` : ''];
  }
  meta = [...meta, k ? `${fmtKcal(k.kcal)} kcal` : ''].filter(Boolean).join(' · ');
  const inner = `<span class="dmark" aria-hidden="true">${l.mark}</span>
    <span class="grow"><b>${esc(l.name)}</b><small>${esc(meta)}</small></span>${icon('check', 'ic ok')}`;
  return act
    ? `<li><button type="button" class="drow" data-act="act-edit" data-id="${esc(s.id)}" aria-label="${esc(act.name)}, fatta: modifica">${inner}</button></li>`
    : `<li><a class="drow" href="${sessionHash(s.id)}">${inner}</a></li>`;
}

/** Body weight of the day, typed in place; the last known one shows as a hint. */
function weightRow(doc, day, ro) {
  const kg = doc.body[day]?.kg;
  const last = bodyWeightAt(doc, day);
  return `<div class="wrow"><label for="bw">Peso</label>
    <input id="bw" type="text" inputmode="decimal" data-act="bw" value="${kg != null ? esc(fmtKg(kg)) : ''}"
      placeholder="${last !== undefined ? esc(fmtKg(last)) : '–'}" autocomplete="off" enterkeyhint="done" aria-label="Peso corporeo in kg" ${ro ? 'disabled' : ''}>
    <span class="muted">kg</span>
    <a class="wrow-go" href="#corpo" aria-label="Corpo: peso e misure">${icon('chevron-right', 'ic')}</a></div>`;
}

function backupNotice(doc) {
  const hasData = doc.sessions.some((s) => !s.deleted) || doc.templates.some((t) => !t.deleted);
  const last = doc.settings.lastBackup || 0;
  if (!hasData || getSync().connected || Date.now() - last <= WEEK_MS) return '';
  return last
    ? `<p class="note-line"><span><i class="dot-warn"></i>Nessun backup da più di 7 giorni</span>
        <button type="button" class="link-btn" data-act="backup">Esporta</button></p>`
    : `<p class="note-line"><span><i class="dot-warn"></i>Dati solo su questo dispositivo</span><a href="#impostazioni">Collega</a></p>`;
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
    main = running.map((p) => schedaCard(doc, p, ro, day)).join('');
    if (!running.length) {
      main = `<section class="card sc-card"><h2 class="sc-name">Nessuna scheda in corso</h2>
        <p class="muted sc-meta">Controlla le date delle tue schede.</p><a class="btn block" href="#schede">Vai alle schede</a></section>`;
    }
  } else if (future) {                             // a day ahead: what will be in progress, nothing to start yet
    const later = schedaGroups(doc, day).running;
    main = later.length
      ? `${later.map((p) => schedaCard(doc, p, ro, day, true)).join('')}<p class="muted center-note">Potrai iniziare l’allenamento quel giorno.</p>`
      : `<section class="card sc-card"><h2 class="sc-name">Nessuna scheda in corso</h2>
        <p class="muted sc-meta">In questo giorno non c’è una scheda attiva.</p></section>`;
  }
  const add = (act, text) => `<li><button type="button" class="drow add" data-act="${act}" ${ro ? 'disabled' : ''}>${icon('plus', 'ic')}<span class="grow">${text}</span></button></li>`;
  const adds = future ? '' : isToday ? add('pick', 'Attività') : `${add('addpast', 'Allenamento della scheda')}${add('pick', 'Attività')}`;

  el.innerHTML = `
    <header class="top today-top">
      <div class="grow"><small class="lbl">${esc(fmtDay(day))}</small>
        <div class="title-row"><h1>${esc(title)}</h1>
          ${isToday ? '' : '<button type="button" class="btn small today-btn" data-act="today" aria-label="Torna a oggi">Oggi</button>'}
          ${kcal ? `<a href="#progressi" class="kcal-link">${fmtKcal(kcal.total)} kcal</a>` : ''}</div></div>
    </header>
    ${weekStrip(doc, day, today)}
    ${openSessions.map((s) => openCard(doc, s)).join('')}
    ${main}
    ${doneToday.length ? `<h2 class="list-title">${isToday ? 'Fatti oggi' : 'Fatti'}</h2>` : ''}
    <ul class="dlist">${doneToday.map((s) => doneRow(doc, s)).join('')}${adds}</ul>
    ${future ? '' : weightRow(doc, day, ro)}
    ${backupNotice(doc)}`;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT' || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'prev') go(addDays(day, -7), today);              // a week back / ahead, same weekday
    else if (act === 'next') go(addDays(day, 7), today);
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
