// "Oggi" (#oggi[/AAAA-MM-DD]): day navigation, week strip, next scheda day, weekly target, open / concluded workouts, body weight.
import {
  planned, isPlannedDone, activeProgram, nextRotationIndex, todayKey, addDays, weekStart, isConcluded, toKey, fromKey,
  weekProgress, workoutLabel, schedaOf,
} from '../logic.js';
import { resolveExercise } from '../library.js';
import { estimateMinutes, sessionVolume, sessionRecords } from '../metrics.js';
import {
  startSession, finishSession, addPastSession, openSessionId, setBody, isReadOnly, getDoc, getSync, exportBackup,
} from '../store.js';
import { unlockAudio, skipRest } from '../timer.js';
import { esc, safeColor, fmtDay, fmtKg, fmtNum, parseNum, DAY_LETTERS } from '../ui.js';
import { openSheet } from './exercises.js';
import { setCounts, fmtMinutes } from './session-rows.js';
import { isScheda, schedaGroups, schedaDays } from './templates.js';

const WEEK_MS = 7 * 864e5;

/** Days one can train: { groups: [{ p, days }] (active scheda first, concluded ones left out), loose: templates without scheda }. */
function choices(doc, today) {
  const { active, others } = schedaGroups(doc, today);
  const groups = [active, ...others].filter(Boolean).map((p) => ({ p, days: schedaDays(doc, p).filter((t) => !t.archived) }));
  const loose = doc.templates.filter((t) => !t.deleted && !t.archived && !schedaOf(doc, t.id)).sort((a, b) => a.order - b.order);
  return { groups, loose };
}
const liveTemplates = (doc, today) => {
  const { groups, loose } = choices(doc, today);
  return [...groups.flatMap((g) => g.days), ...loose];
};
const tplOf = (doc, id) => (id ? doc.templates.find((t) => t.id === id) ?? null : null);
const usable = (doc, id) => doc.templates.some((t) => t.id === id && !t.deleted && !t.archived);
const sessionHash = (id) => `#sessione/${encodeURIComponent(id)}`;

function look(doc, s) {
  const t = tplOf(doc, s.tpl);
  return { name: workoutLabel(doc, s.tpl), emoji: t ? t.emoji || '💪' : '🏋️', color: safeColor(t?.color) };
}

/** Selected day from the route: a valid date not after today, else today. */
function dayOf(param, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param) || toKey(fromKey(param)) !== param) return today;
  return param <= today ? param : today;
}

const go = (d, today) => location.replace(d >= today ? '#oggi' : `#oggi/${d}`);

// ---- Week strip -------------------------------------------------------------------

/** Dots of day d: planned (outline) and done (filled), matched by template; at most 4. */
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
  for (let n = p.items.length; n < p.count; n++) {           // past rotation days: only the number is known
    const s = left.shift();
    dots.push({ c: color(s?.tpl), done: !!s });
  }
  for (const s of left) dots.push({ c: color(s.tpl), done: true });
  return dots;
}

function weekStrip(doc, day, today) {
  const ws = weekStart(day);
  return `<nav class="week" aria-label="Settimana">${DAY_LETTERS.map((L, k) => {
    const d = addDays(ws, k);
    const dots = dayDots(doc, d, today);
    const planned = dots.filter((x) => !x.done).length;
    const done = dots.length - planned;
    const label = `${fmtDay(d)}${done ? `, ${done} fatt${done === 1 ? 'o' : 'i'}` : ''}${planned ? `, ${planned} previst${planned === 1 ? 'o' : 'i'}` : ''}`;
    const inner = `${L}<b>${+d.slice(8)}</b><span class="dots">${dots.slice(0, 4)
      .map((x) => `<i class="${x.done ? 'done' : ''}" style="--c:${x.c}"></i>`).join('')}</span>`;
    const cls = `day${d === day ? ' sel' : ''}${d === today ? ' now' : ''}`;
    return d > today
      ? `<span class="${cls} future" aria-label="${esc(label)}">${inner}</span>`
      : `<a class="${cls}" href="${d === today ? '#oggi' : `#oggi/${d}`}" aria-label="${esc(label)}"
          ${d === day ? 'aria-current="date"' : ''}>${inner}</a>`;
  }).join('')}</nav>`;
}

// ---- Cards ---------------------------------------------------------------------------

function exerciseList(doc, t) {
  const names = t.items.map((it) => {
    const ex = resolveExercise(doc, it.ex);
    const work = it.sets.filter((s) => !s.w).length;
    const sets = ex && (ex.kind === 'cardio' || ex.kind === 'sport') ? '' : ` <small>· ${work} serie</small>`;
    return `<li>${esc(ex?.name ?? 'Esercizio rimosso')}${sets}</li>`;
  });
  const more = names.length > 6 ? `<li>+ altri ${names.length - 6}</li>` : '';
  return names.length ? `<ul>${names.slice(0, 6).join('')}${more}</ul>` : '';
}

/** Card of a planned (or next rotation) template; action depends on day and status. */
function tplCard(doc, t, { day, today, kicker, open, ro }) {
  const done = isPlannedDone(doc, day, t.id);
  const mins = estimateMinutes(doc, t, doc.settings.rest);
  const n = t.items.length;
  const meta = `${n} ${n === 1 ? 'esercizio' : 'esercizi'}${mins > 0 ? ` · ~${mins} min` : ''}`;
  let action;
  if (done) action = '<span class="status ok">✓ Fatto</span>';
  else if (open) action = `<a class="btn primary" href="${sessionHash(open.id)}">Riprendi</a>`;
  else if (day === today) action = `<button type="button" class="btn primary" data-act="start" data-tpl="${esc(t.id)}" ${ro ? 'disabled' : ''}>Inizia</button>`;
  else action = `<span class="status">Non svolto</span><button type="button" class="btn small" data-act="addpast" data-tpl="${esc(t.id)}" ${ro ? 'disabled' : ''}>Registra</button>`;
  return `<section class="card tpl-card${done ? ' done' : ''}" style="--c:${safeColor(t.color)}">
    <div class="head"><span class="badge" aria-hidden="true">${esc(t.emoji || '💪')}</span>
      <div class="grow"><b>${esc(workoutLabel(doc, t.id))}</b><small class="muted">${kicker ? `${esc(kicker)} · ` : ''}${meta}</small></div></div>
    ${exerciseList(doc, t)}
    <div class="card-actions">${action}</div>
  </section>`;
}

function openCard(doc, s) {
  const l = look(doc, s);
  const { done, total } = setCounts(s);
  const since = s.date === todayKey() ? `In corso da ${fmtMinutes(Date.now() - s.start)}` : `Aperto dal ${fmtDay(s.date).toLowerCase()}`;
  return `<section class="card tpl-card live" style="--c:${l.color}">
    <div class="head"><span class="badge" aria-hidden="true">${esc(l.emoji)}</span>
      <div class="grow"><b>${esc(l.name)}</b><small class="muted">${esc(since)} · ${done}/${total} serie</small></div>
      <a class="btn primary" href="${sessionHash(s.id)}">Riprendi</a></div>
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
function openPicker(doc, today, nextId) {
  const { groups, loose } = choices(doc, today);
  const { box, close } = openSheet(`<h2>Scegli l’allenamento</h2>
    ${groups.map(({ p, days }) => `<h3 class="sheet-sub">${esc(p.emoji || '💪')} ${esc(p.name)}</h3>
      ${days.length ? days.map((t) => tplButton(t, t.dayName ?? t.name, t.id === nextId ? 'Prossimo' : '')).join('')
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
  if (id != null) location.hash = sessionHash(id);
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
    if (m === 'resume') location.hash = sessionHash(openId);
    else if (m === 'end') {
      finishSession(openId, {});
      skipRest();
      begin(tpl);
    }
  };
}

/** Past day: template (or free) + minutes, then the created (concluded) session opens for editing. */
function openAddPast(doc, day, today, preset = null) {
  const list = liveTemplates(doc, today);
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

/** "x/N questa settimana": small progress row under the day's card. */
function weekGoal({ done, target }) {
  const shown = Math.min(done, target);
  return `<div class="week-goal"><span><b>${done}/${target}</b> questa settimana${done >= target ? ' ✓' : ''}</span>
    <span class="bar" role="progressbar" aria-label="Allenamenti della settimana" aria-valuemin="0" aria-valuemax="${target}"
      aria-valuenow="${shown}"><i style="width:${Math.round((shown / target) * 100)}%"></i></span></div>`;
}

/** First day after `day` (within two weeks) with a planned workout: { d, id }, else null. */
function upcoming(doc, day, today) {
  for (let k = 1; k <= 14; k++) {
    const d = addDays(day, k);
    const q = planned(doc, d, today);
    if (q.count) return { d, id: q.items[0] ?? null };
  }
  return null;
}

export function render(el, { doc, param, today }) {
  const day = dayOf(param, today);
  const ro = isReadOnly();
  const isToday = day === today;
  const title = isToday ? 'Oggi' : day === addDays(today, -1) ? 'Ieri' : fmtDay(day).split(' ')[0];
  const { groups, loose } = choices(doc, today);
  const openSessions = doc.sessions.filter((s) => !s.deleted && s.end == null).sort((a, b) => b.start - a.start);
  const doneToday = doc.sessions.filter((s) => isConcluded(s) && s.date === day).sort((a, b) => a.start - b.start);
  const p = planned(doc, day, today);
  const openFor = (id) => (isToday ? openSessions.find((s) => s.tpl === id && s.date === day) : null);

  // Rotation without training days: suggest the next day of the sequence (today only).
  const prog = activeProgram(doc, day);
  const scheda = isScheda(prog) ? prog : null;
  let next = null;
  if (isToday && prog?.kind === 'rotation' && !prog.days && prog.seq.length) {
    const id = prog.seq[nextRotationIndex(doc, prog)];
    if (usable(doc, id) && !p.items.includes(id)) next = tplOf(doc, id);
  }
  // Scheda with preferred days and no workout today: rest, and which day comes next.
  const rest = isToday && scheda?.days && !p.count && !next ? upcoming(doc, day, today) : null;
  const nextId = next?.id ?? rest?.id ?? (scheda ? scheda.seq[nextRotationIndex(doc, scheda)] : null);
  const goal = isToday && scheda ? weekProgress(doc, today) : null;

  let main = '';
  if (!groups.length && !loose.length && !p.count && !doc.programs.some(isScheda)) {
    main = `<div class="card empty"><p>Nessuna scheda ancora.</p>
      <p class="muted">Una scheda raccoglie i tuoi giorni di allenamento e li propone a rotazione.</p>
      <div class="btn-row center"><a class="btn primary" href="#scheda/nuova">Crea la tua prima scheda</a>
      ${isToday ? `<button type="button" class="btn" data-act="free" ${ro ? 'disabled' : ''}>Allenamento libero</button>` : ''}</div></div>`;
  } else {
    main += p.items.map((id) => tplCard(doc, tplOf(doc, id), { day, today, open: openFor(id), ro })).join('');
    if (p.count > p.items.length) {                           // past rotation day: only the number is known
      const ok = doneToday.length >= p.count;
      main += `<section class="card tpl-card${ok ? ' done' : ''}"><div class="head"><span class="badge" aria-hidden="true">🔁</span>
        <div class="grow"><b>Allenamento previsto</b><small class="muted">Scheda ${esc(prog?.name ?? '')}</small></div>
        <span class="status${ok ? ' ok' : ''}">${ok ? '✓ Fatto' : 'Non svolto'}</span></div></section>`;
    }
    if (next) main += tplCard(doc, next, { day, today, kicker: 'Prossimo', open: openFor(next.id), ro });
    if (!p.count && !next) {
      const msg = !isToday ? 'Nessun allenamento previsto.'
        : rest ? `Prossimo: ${fmtDay(rest.d)}`
          : !prog && doc.programs.some(isScheda) ? 'Nessuna scheda attiva.' : 'Nessun allenamento previsto.';
      main += `<section class="card rest-card"><div class="head"><span class="badge" aria-hidden="true">😴</span>
        <div class="grow"><b>${rest ? 'Oggi riposo' : 'Riposo'}</b><small class="muted">${esc(msg)}</small></div></div>
        ${isToday ? `<div class="card-actions">${!prog && doc.programs.some(isScheda) ? '<a class="btn" href="#schede">Vai alle schede</a>' : ''}
          <button type="button" class="btn primary" data-act="pick" ${ro ? 'disabled' : ''}>Allenati comunque</button></div>` : ''}</section>`;
    }
    if (goal?.target != null) main += weekGoal(goal);
    if ((p.count || next) && isToday) {
      main += `<button type="button" class="btn block other-btn" data-act="pick" ${ro ? 'disabled' : ''}>+ Altro allenamento</button>`;
    }
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
      openPicker(doc, today, nextId);
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
