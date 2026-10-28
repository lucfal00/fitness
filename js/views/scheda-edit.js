// "Scheda" (#scheda/<id|nuova>): name, look, days, weekly schedule; activate / end; delete.
import {
  getDoc, saveScheda, addSchedaDay, moveSchedaDay, duplicateSchedaDay, deleteSchedaDay, deleteScheda, activateProgram, endProgram,
  isReadOnly,
} from '../store.js';
import { todayKey, fromKey, toKey } from '../logic.js';
import { estimateMinutes } from '../metrics.js';
import {
  esc, safeColor, fmtFull, DAY_LETTERS, COLORS,
} from '../ui.js';
import { openSheet } from './exercises.js';
import {
  isScheda, schedaDays, isConcludedScheda, plural,
} from './templates.js';

const EMOJIS = ['💪', '🏋️', '🦵', '🏃', '🚴', '🧘', '🔥', '⚡', '🥊', '🏊', '🤸', '🎯'];
const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

// Unsaved form state lives here (not in the DOM), so store events that redraw the view never lose it.
// It also survives a visit to the day editor (#scheda/<id>/giorno/…) and is dropped when leaving the scheda screens.
let draft = null;
let refresh = () => {};
let own = false;                    // true while this view itself writes to the store (its updatedAt is not "another device")
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#scheda/')) draft = null;
  });
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toKey(fromKey(s)) === s;

function mutate(fn) {
  own = true;
  try {
    return fn();
  } finally {
    own = false;
  }
}

const fromScheda = (p) => ({
  key: p.id, id: p.id, name: p.name, emoji: p.emoji || '💪', color: safeColor(p.color), perWeek: p.perWeek > 0 ? p.perWeek : 3,
  days: [...(p.days ?? [])], updatedAt: p.updatedAt ?? null, dirty: false, touched: new Set(),
});

const blank = (doc) => ({
  key: 'nuova', id: null, name: '', emoji: '💪', color: COLORS[doc.programs.filter(isScheda).length % COLORS.length],
  perWeek: 3, days: [], updatedAt: null, dirty: false, touched: new Set(),
});

/** A new scheda saves everything; an existing one only the fields that were edited (never a whole stale copy). */
function buildFields(d) {
  const all = {
    name: d.name.trim(), emoji: d.emoji.trim() || '💪', color: d.color, perWeek: d.perWeek,
    days: d.days.length ? [...d.days].sort((a, b) => a - b) : null,
  };
  if (!d.id) return all;
  const f = { id: d.id };
  for (const k of d.touched) f[k] = all[k];
  return f;
}

const validate = (d) => {
  const n = d.name.trim().length;
  return n < 1 || n > 40 ? ['Il nome deve avere da 1 a 40 caratteri.'] : [];
};

const SAVE_FAIL = 'Impossibile salvare: la scheda è stata eliminata su un altro dispositivo o l’app è in sola lettura.';

function dayRow(doc, p, t, i, n, ro) {
  const mins = estimateMinutes(doc, t, doc.settings.rest);
  const meta = `${plural(t.items.length, 'esercizio', 'esercizi')}${mins > 0 ? ` · ~${mins} min` : ''}`;
  const dis = ro ? 'disabled' : '';
  const name = t.dayName ?? t.name;
  return `<li class="day-row" data-id="${esc(t.id)}">
    <a class="row" href="#scheda/${encodeURIComponent(p.id)}/giorno/${encodeURIComponent(t.id)}">
      <span class="badge" aria-hidden="true">${i + 1}</span>
      <span><b>${esc(name)}</b><small>${esc(meta)}</small></span>
      <span class="chev" aria-hidden="true">›</span></a>
    <div class="day-actions">
      <span class="order">
        <button type="button" data-act="up" aria-label="Sposta su ${esc(name)}" ${i === 0 || ro ? 'disabled' : ''}>↑</button>
        <button type="button" data-act="down" aria-label="Sposta giù ${esc(name)}" ${i === n - 1 || ro ? 'disabled' : ''}>↓</button>
      </span>
      <button type="button" class="btn small" data-act="dup" aria-label="Duplica ${esc(name)}" ${dis}>Duplica</button>
      <button type="button" class="btn small danger" data-act="rm" aria-label="Elimina ${esc(name)}" ${dis}>Elimina</button>
    </div></li>`;
}

/** "Attiva dal …" / "Programmata dal …" / "Conclusa il …" / "Non attiva". */
function statusText(p, today) {
  if (p.from == null) return 'Non attiva';
  if (p.from > today) return `Programmata dal ${fmtFull(p.from)}`;
  if (p.to != null && p.to < today) return `Conclusa il ${fmtFull(p.to)} (dal ${fmtFull(p.from)})`;
  return `Attiva dal ${fmtFull(p.from)}${p.to != null ? ` al ${fmtFull(p.to)}` : ''}`;
}

export function render(el, ctx) {
  const { doc, param, today } = ctx;
  refresh = ctx.refresh;
  const p = param === 'nuova' ? null : doc.programs.find((x) => x.id === param && !x.deleted && x.kind === 'rotation');
  if (param !== 'nuova' && !p) {
    location.hash = '#schede';
    return;
  }
  if (!draft || draft.key !== param) draft = p ? fromScheda(p) : blank(doc);
  let stale = false;
  if (p && draft.updatedAt !== (p.updatedAt ?? null)) {         // stored scheda changed while the form is open
    if (own) draft.updatedAt = p.updatedAt ?? null;
    else if (draft.dirty) stale = true;
    else draft = fromScheda(p);
  }
  const d = draft;
  const ro = isReadOnly();
  const days = p ? schedaDays(doc, p) : [];
  const running = !!p && p.from != null && p.from <= today && (p.to == null || p.to >= today);
  const scheduled = !!p && p.from != null && p.from > today;
  const concluded = !!p && isConcludedScheda(p, today);
  const staleBox = stale ? `<div class="card form"><p class="error" role="alert">Questa scheda è stata modificata su un altro dispositivo.</p>
      <button type="button" class="btn" data-act="reload">Ricarica</button></div>` : '';

  const activation = !p ? '' : `<h2 class="list-title">Attivazione</h2>
    <div class="card form">
      <p style="margin:0"><b>${esc(statusText(p, today))}</b></p>
      ${running || scheduled
    ? `<button type="button" class="btn block" data-act="end" ${ro ? 'disabled' : ''}>${scheduled ? 'Annulla attivazione' : 'Termina ora'}</button>`
    : `<button type="button" class="btn primary block" data-act="activate">${concluded ? 'Riattiva…' : 'Attiva…'}</button>`}
      ${running || scheduled ? '' : '<small class="muted act-hint" hidden>Aggiungi almeno un giorno per attivare la scheda.</small>'}
    </div>`;

  el.innerHTML = `
    <header class="top"><a class="back" href="#schede">‹ Schede</a></header>
    <h1 style="margin-bottom:16px">${p ? 'Modifica scheda' : 'Nuova scheda'}</h1>
    ${staleBox}
    <div class="card form">
      <label class="field">Nome<input data-f="name" maxlength="40" value="${esc(d.name)}" placeholder="Es. Full body" autocomplete="off"></label>
      <fieldset><legend>Emoji</legend>
        <div class="emoji-row">${EMOJIS.map((x) => `<button type="button" data-emoji="${x}" class="${x === d.emoji ? 'on' : ''}" aria-label="Usa ${x}">${x}</button>`).join('')}</div>
        <input data-f="emoji" maxlength="8" value="${esc(d.emoji)}" aria-label="Emoji personalizzata">
      </fieldset>
      <fieldset><legend>Colore</legend>
        <div class="swatches">${COLORS.map((c, i) => `<label class="pick"><input type="radio" name="color" data-f="color" value="${c}"
          ${c === d.color ? 'checked' : ''} aria-label="Colore ${i + 1}"><span style="--sw:${c}"></span></label>`).join('')}</div>
      </fieldset>
    </div>

    <h2 class="list-title">Giorni</h2>
    <div class="card">
      ${days.length ? `<ul class="rows day-list">${days.map((t, i) => dayRow(doc, p, t, i, days.length, ro)).join('')}</ul>`
    : `<p class="muted" style="margin:0 0 12px">${p ? 'Nessun giorno: aggiungi il primo.' : 'Dai un nome alla scheda, poi aggiungi i giorni.'}</p>`}
      <button type="button" class="btn block" data-act="addday" style="margin-top:8px">+ Aggiungi giorno</button>
    </div>

    <h2 class="list-title">Programmazione</h2>
    <div class="card form">
      <div class="pw-row"><span id="pw-l"><b>Volte a settimana</b></span>
        <div class="stepper" role="group" aria-labelledby="pw-l">
          <button type="button" data-act="pw-" aria-label="Meno" ${d.perWeek <= 1 ? 'disabled' : ''}>−</button>
          <span class="val" aria-live="polite"><b class="pw-val">${d.perWeek}</b></span>
          <button type="button" data-act="pw+" aria-label="Più" ${d.perWeek >= 7 ? 'disabled' : ''}>+</button></div></div>
      <fieldset><legend>Giorni preferiti (facoltativi)</legend>
        <div class="days-row">${DAY_LETTERS.map((L, g) => `<label class="pick"><input type="checkbox" data-day="${g + 1}"
          ${d.days.includes(g + 1) ? 'checked' : ''} aria-label="${DAY_NAMES[g]}"><span>${L}</span></label>`).join('')}</div>
        <small class="muted">Solo per vederli sul calendario.</small></fieldset>
    </div>
    ${activation}
    <div class="card form" style="margin-top:12px">
      <div class="errors" role="alert"></div>
      ${ro ? '<p class="error">Modalità sola lettura: impossibile salvare.</p>' : ''}
      <button type="button" class="btn primary block" data-act="save">Salva</button>
      ${p ? `<div class="danger-zone"><button type="button" class="btn danger" data-act="delete" ${ro ? 'disabled' : ''}>Elimina scheda</button></div>` : ''}
    </div>`;

  const save = el.querySelector('[data-act=save]');
  const addDay = el.querySelector('[data-act=addday]');
  const act = el.querySelector('[data-act=activate]');
  const hint = el.querySelector('.act-hint');
  const errBox = el.querySelector('.errors');
  const fail = (m) => { errBox.innerHTML = `<p class="error">${esc(m)}</p>`; };
  const status = () => {
    const msgs = validate(d);
    errBox.innerHTML = msgs.map((m) => `<p class="error">${esc(m)}</p>`).join('');
    save.disabled = ro || msgs.length > 0;
    addDay.disabled = ro || msgs.length > 0;
    if (act) {
      const none = days.length === 0;
      act.disabled = ro || msgs.length > 0 || none;
      hint.hidden = !none;
    }
  };
  status();

  const touch = (f) => { d.touched.add(f); d.dirty = true; };

  /** Saves the form; a new scheda is created first. Returns the scheda id, or null (message shown). */
  function persist() {
    const id = mutate(() => saveScheda(buildFields(d)));
    if (id == null) fail(SAVE_FAIL);
    return id;
  }

  function openActivate() {
    const { box, close } = openSheet(`<h2>${concluded ? 'Riattiva scheda' : 'Attiva scheda'}</h2>
      <div class="form"><label class="field">Data di inizio<input type="date" name="from" value="${today}"></label>
        <p class="error" role="alert" hidden></p></div>
      <button type="button" class="btn primary center" data-act="go" ${ro ? 'disabled' : ''}>${concluded ? 'Riattiva' : 'Attiva'}</button>
      <button type="button" class="btn" data-act="cancel">Annulla</button>`);
    const err = (m) => {
      const e = box.querySelector('.error');
      e.textContent = m;
      e.hidden = false;
    };
    box.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'cancel') { close(); return; }
      if (b.dataset.act !== 'go' || validate(d).length) return;
      const from = box.querySelector('[name=from]').value;
      if (!isDate(from)) { err('Scegli una data di inizio valida.'); return; }
      const edited = Object.keys(buildFields(d)).length > 1;
      let id = null;
      mutate(() => {
        if (concluded) {                                 // history stays unchanged: the copy is activated (and edited)
          id = activateProgram(d.id, from, null);
          if (id != null && edited) saveScheda({ ...buildFields(d), id });
        } else {
          id = saveScheda(buildFields(d));
          if (id != null) id = activateProgram(id, from, null);
        }
      });
      if (id == null) { err(SAVE_FAIL); return; }
      close();
      draft = null;
      if (location.hash === `#scheda/${encodeURIComponent(id)}`) refresh();
      else location.hash = `#scheda/${encodeURIComponent(id)}`;
    };
  }

  el.oninput = el.onchange = (e) => {
    const t = e.target;
    if (t.dataset.f === 'color') {
      if (t.checked) { d.color = t.value; touch('color'); }
    } else if (t.dataset.f) {
      d[t.dataset.f] = t.value;
      touch(t.dataset.f);
      if (t.dataset.f === 'emoji') el.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('on', b.dataset.emoji === d.emoji));
      status();
    } else if (t.dataset.day) {
      const g = +t.dataset.day;
      d.days = t.checked ? [...new Set([...d.days, g])] : d.days.filter((x) => x !== g);
      touch('days');
    }
  };

  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.act;
    if (b.dataset.emoji) {
      d.emoji = b.dataset.emoji;
      touch('emoji');
      el.querySelector('[data-f=emoji]').value = d.emoji;
      el.querySelectorAll('[data-emoji]').forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    if (a === 'reload') {
      draft = p ? fromScheda(p) : blank(doc);
      refresh();
    } else if (a === 'pw-' || a === 'pw+') {
      d.perWeek = Math.min(7, Math.max(1, d.perWeek + (a === 'pw+' ? 1 : -1)));
      touch('perWeek');
      el.querySelector('.pw-val').textContent = d.perWeek;
      el.querySelector('[data-act="pw-"]').disabled = d.perWeek <= 1;
      el.querySelector('[data-act="pw+"]').disabled = d.perWeek >= 7;
      if (document.activeElement?.disabled) el.querySelector(a === 'pw+' ? '[data-act="pw-"]' : '[data-act="pw+"]').focus();
    } else if (a === 'addday') {
      if (ro || validate(d).length) return;
      let sid = p?.id ?? null;
      if (!p) {                                          // the day needs a saved scheda
        sid = persist();
        if (sid == null) return;
        draft = null;
      }
      const tid = mutate(() => addSchedaDay(sid));
      if (tid != null) location.hash = `#scheda/${encodeURIComponent(sid)}/giorno/${encodeURIComponent(tid)}`;
      else fail(SAVE_FAIL);
    } else if (a === 'up' || a === 'down' || a === 'dup' || a === 'rm') {
      const tid = b.closest('[data-id]').dataset.id;
      if (a === 'up' || a === 'down') mutate(() => moveSchedaDay(tid, a === 'up' ? -1 : 1));
      else if (a === 'dup') mutate(() => duplicateSchedaDay(tid));
      else if (confirm('Eliminare questo giorno? Le sessioni già svolte restano nello storico.')) mutate(() => deleteSchedaDay(tid));
    } else if (a === 'activate') {
      if (!validate(d).length) openActivate();
    } else if (a === 'end') {
      if (!ro && confirm('Terminare ora la scheda?')) mutate(() => endProgram(p.id));
    } else if (a === 'save') {
      if (ro || validate(d).length) return;
      if (p && !d.touched.size) {                        // nothing edited
        draft = null;
        location.hash = '#schede';
        return;
      }
      const id = persist();
      if (id == null) return;
      draft = null;
      location.hash = p ? '#schede' : `#scheda/${encodeURIComponent(id)}`;
    } else if (a === 'delete') {
      if (!ro && confirm(`Eliminare "${p.name}" e i suoi giorni? Le sessioni già svolte restano nello storico.`)) {
        deleteScheda(p.id);
        draft = null;
        location.hash = '#schede';
      }
    }
  };
}
