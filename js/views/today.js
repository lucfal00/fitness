// "Oggi" (#oggi[/AAAA-MM-DD]): day navigation, week strip, schede in progress with their days, open / concluded workouts, body weight.
import {
  todayKey, addDays, weekStart, isConcluded, isDate, workoutLabel, isScheda, usable, schedaDays, schedaGroups, lastDayOf,
  choosableDays, choosableList,
} from '../logic.js';
import { resolveExercise } from '../library.js';
import { isTimed } from '../interval.js';
import { estimateMinutes, sessionVolume, sessionRecords } from '../metrics.js';
import {
  startSession, finishSession, addPastSession, openSessionId, setBody, isReadOnly, getDoc, getSync, exportBackup,
} from '../store.js';
import { unlockAudio, skipRest } from '../timer.js';
import { esc, safeColor, fmtDay, fmtKg, fmtNum, parseNum, fmtFull, DAY_LETTERS } from '../ui.js';
import { openSheet } from './exercises.js';
import { setCounts, fmtMinutes } from './session-rows.js';

const WEEK_MS = 7 * 864e5;

const tplOf = (doc, id) => (id ? doc.templates.find((t) => t.id === id) ?? null : null);
const sessionHash = (id) => `#sessione/${encodeURIComponent(id)}`;
/** Live timed workouts open in the timer, everything else in the session screen. */
const liveHash = (s) => (s.mode === 'timer' && s.end == null ? `#timer/${encodeURIComponent(s.id)}` : sessionHash(s.id));

function look(doc, s) {
  const t = tplOf(doc, s.tpl);
  return { name: workoutLabel(doc, s.tpl), emoji: t ? t.emoji || '💪' : '🏋️', color: safeColor(t?.color) };
}

/** Selected day from the route: a valid date not after today, else today. */
function dayOf(param, today) {
  if (!isDate(param)) return today;
  return param <= today ? param : today;
}

const go = (d, today) => location.replace(d >= today ? '#oggi' : `#oggi/${d}`);

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
    return d > today
      ? `<span class="${cls} future" aria-label="${esc(label)}">${inner}</span>`
      : `<a class="${cls}" href="${d === today ? '#oggi' : `#oggi/${d}`}" aria-label="${esc(label)}"
          ${d === day ? 'aria-current="date"' : ''}>${inner}</a>`;
  }).join('')}</nav>`;
}

// ---- Cards ---------------------------------------------------------------------------

/** Scheda in progress: its days as buttons; the one trained last is marked. */
function schedaCard(doc, p, ro) {
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
    return `<button type="button" class="btn choice-btn day-btn" data-act="start" data-tpl="${esc(t.id)}" ${ro ? 'disabled' : ''}>
      <span class="grow"><b>${esc(t.dayName ?? t.name)}</b><small class="muted">${esc(meta)}</small></span>
      ${t.id === lastId && days.length > 1 ? '<span class="pill">Ultimo fatto</span>' : ''}${days.length === 1 ? '<span class="day-go" aria-hidden="true">▶</span>' : ''}</button>`;
  };
  return `<section class="card tpl-card" style="--c:${safeColor(p.color)}">
    <div class="head"><span class="badge" aria-hidden="true">${esc(p.emoji || '💪')}</span>
      <div class="grow"><b>${esc(p.name)}</b><small class="muted">${esc(sub)}</small></div>
      <a class="btn small" href="#scheda/${encodeURIComponent(p.id)}" aria-label="Modifica ${esc(p.name)}">Modifica</a></div>
    ${days.length ? `${days.length > 1 ? '<p class="muted day-ask">Che giorno fai?</p>' : ''}<div class="day-btns">${days.map(btn).join('')}</div>`
    : `<p class="muted">Nessun giorno con esercizi: <a href="#scheda/${encodeURIComponent(p.id)}">aggiungili</a>.</p>`}
  </section>`;
}

function openCard(doc, s) {
  const l = look(doc, s);
  const { done, total } = setCounts(s);
  const since = s.date === todayKey() ? `In corso da ${fmtMinutes(Date.now() - s.start)}` : `Aperto dal ${fmtDay(s.date).toLowerCase()}`;
  return `<section class="card tpl-card live" style="--c:${l.color}">
    <div class="head"><span class="badge" aria-hidden="true">${esc(l.emoji)}</span>
      <div class="grow"><b>${esc(l.name)}</b><small class="muted">${esc(since)} · ${done}/${total} serie</small></div>
      <a class="btn primary" href="${liveHash(s)}">Riprendi</a></div>
  </section>`;
}

function doneCard(doc, s) {
  const l = look(doc, s);
  const vol = sessionVolume(doc, s);
  const { done, total } = setCounts(s);
  const rec = new Set(sessionRecords(doc, s).records.map((r) => r.ex)).size;
  const meta = [fmtMinutes(s.end - s.start), vol ? `${fmtNum(vol)} kg` : '', `${done}/${total} serie`,
    rec ? `🏆 ${rec} record` : ''].filter(Boolean).join(' · ');
  return `<a class="card sess-card" href="${sessionHash(s.id)}" style="--c:${l.color}">
    <span class="badge" aria-hidden="true">${esc(l.emoji)}</span>
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

function tplButton(t, label, tag = '') {
  return `<button type="button" class="btn choice-btn" data-tpl="${esc(t.id)}"><span class="badge" style="--c:${safeColor(t.color)}"
    aria-hidden="true">${esc(t.emoji || '💪')}</span><span class="grow">${esc(label)}</span>${tag ? `<span class="pill">${esc(tag)}</span>` : ''}</button>`;
}

/** "Allenati comunque" / "Altro allenamento": schede with their days, or a free workout. */
function openPicker(doc, today) {
  const { groups, loose } = choosableDays(doc, today);
  const { box, close } = openSheet(`<h2>Scegli l’allenamento</h2>
    ${groups.map(({ p, days }) => `<h3 class="sheet-sub">${esc(p.emoji || '💪')} ${esc(p.name)}</h3>
      ${days.length ? days.map((t) => tplButton(t, t.dayName ?? t.name)).join('')
    : '<p class="muted">Nessun giorno in questa scheda.</p>'}`).join('')}
    ${loose.map((t) => tplButton(t, t.name)).join('')}
    <button type="button" class="btn choice-btn" data-tpl=""><span class="badge" aria-hidden="true">🏋️</span><span>Allenamento libero</span></button>
    <button type="button" class="btn center" data-act="cancel">Annulla</button>`);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    close();
    if ('tpl' in b.dataset) start(b.dataset.tpl || null);
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
    <p class="muted">${esc(l.emoji)} ${esc(l.name)} · iniziato ${s.date === todayKey() ? `${fmtMinutes(Date.now() - s.start)} fa` : `il ${esc(fmtDay(s.date).toLowerCase())}`}</p>
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
  const title = isToday ? 'Oggi' : day === addDays(today, -1) ? 'Ieri' : fmtDay(day).split(' ')[0];
  const openSessions = doc.sessions.filter((s) => !s.deleted && s.end == null).sort((a, b) => b.start - a.start);
  const doneToday = doc.sessions.filter((s) => isConcluded(s) && s.date === day).sort((a, b) => a.start - b.start);
  const { running } = schedaGroups(doc, today);
  const anyScheda = doc.programs.some(isScheda);

  let main = '';
  if (isToday && !anyScheda) {
    main = `<div class="card empty"><p>Nessuna scheda ancora.</p>
      <p class="muted">Crea una scheda con i tuoi giorni di allenamento (Giorno 1, 2, 3…) e il suo periodo.</p>
      <div class="btn-row center"><a class="btn primary" href="#scheda/nuova">Crea la tua prima scheda</a>
      <button type="button" class="btn" data-act="free" ${ro ? 'disabled' : ''}>Allenamento libero</button></div></div>`;
  } else if (isToday) {
    main = running.map((p) => schedaCard(doc, p, ro)).join('');
    if (!running.length) {
      main = `<section class="card rest-card"><div class="head"><span class="badge" aria-hidden="true">😴</span>
        <div class="grow"><b>Nessuna scheda in corso</b><small class="muted">Controlla le date delle tue schede.</small></div></div>
        <div class="card-actions"><a class="btn" href="#schede">Vai alle schede</a></div></section>`;
    }
    main += `<button type="button" class="btn block other-btn" data-act="pick" ${ro ? 'disabled' : ''}>+ Altro allenamento</button>`;
  }

  el.innerHTML = `
    <header class="top">
      <button type="button" class="icon-btn" data-act="prev" aria-label="Giorno precedente">‹</button>
      <div class="grow"><h1>${esc(title)}</h1><small>${esc(fmtDay(day))}</small></div>
      ${isToday ? '' : '<button type="button" class="btn small today-btn" data-act="today" aria-label="Torna a oggi">Oggi</button>'}
      <button type="button" class="icon-btn" data-act="next" aria-label="Giorno successivo" ${isToday ? 'disabled' : ''}>›</button>
    </header>
    ${weekStrip(doc, day, today)}
    ${backupNotice(doc)}
    ${openSessions.map((s) => openCard(doc, s)).join('')}
    ${main}
    ${doneToday.length ? `<h2 class="list-title">${isToday ? 'Fatti oggi' : 'Allenamenti fatti'}</h2>${doneToday.map((s) => doneCard(doc, s)).join('')}` : ''}
    ${isToday ? '' : `<button type="button" class="btn block add-past" data-act="addpast" ${ro ? 'disabled' : ''}>+ Aggiungi allenamento</button>`}
    ${weightCard(doc, day, ro)}`;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT' || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'prev') go(addDays(day, -1), today);
    else if (act === 'next') go(addDays(day, 1), today);
    else if (act === 'today') go(today, today);
    else if (act === 'start') start(b.dataset.tpl);
    else if (act === 'free') start(null);
    else if (act === 'pick') {
      unlockAudio();
      openPicker(doc, today);
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
  bw.onkeydown = (e) => { if (e.key === 'Enter') bw.blur(); };
}
