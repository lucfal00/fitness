// "Scheda" (#scheda/<id|nuova>): name, look, period (start, optional end), days; delete.
import {
  saveScheda, duplicateSchedaDay, moveSchedaDay, deleteSchedaDay, deleteScheda, isReadOnly,
} from '../store.js';
import { isScheda, schedaDays, isDate } from '../logic.js';
import { estimateMinutes } from '../metrics.js';
import { esc, safeColor, COLORS } from '../ui.js';
import { openSheet } from './exercises.js';
import { plural } from './templates.js';

const EMOJIS = ['💪', '🏋️', '🦵', '🏃', '🚴', '🧘', '🔥', '⚡', '🥊', '🏊', '🤸', '🎯'];

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

function mutate(fn) {
  own = true;
  try {
    return fn();
  } finally {
    own = false;
  }
}

const fromScheda = (p) => ({
  key: p.id, id: p.id, name: p.name, emoji: p.emoji || '💪', color: safeColor(p.color),
  from: p.from ?? '', to: p.to ?? '', updatedAt: p.updatedAt ?? null, dirty: false, touched: new Set(),
});

const blank = (doc, today) => ({
  key: 'nuova', id: null, name: '', emoji: '💪', color: COLORS[doc.programs.filter(isScheda).length % COLORS.length],
  from: today, to: '', updatedAt: null, dirty: false, touched: new Set(),
});

/** A new scheda saves everything; an existing one only the fields that were edited (never a whole stale copy). */
function buildFields(d) {
  const all = {
    name: d.name.trim(), emoji: d.emoji.trim() || '💪', color: d.color, from: d.from, to: d.to || null,
  };
  if (!d.id) return all;
  const f = { id: d.id };
  for (const k of d.touched) f[k] = all[k];
  if ('from' in f || 'to' in f) Object.assign(f, { from: all.from, to: all.to });   // the period is saved as a pair
  return f;
}

const validate = (d) => {
  const out = [];
  const n = d.name.trim().length;
  if (n < 1 || n > 40) out.push('Il nome deve avere da 1 a 40 caratteri.');
  if (!isDate(d.from)) out.push('Scegli la data di inizio.');
  else if (d.to && (!isDate(d.to) || d.to < d.from)) out.push('La data di fine deve essere uguale o successiva all’inizio.');
  return out;
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

export function render(el, ctx) {
  const { doc, param, today } = ctx;
  refresh = ctx.refresh;
  const p = param === 'nuova' ? null : doc.programs.find((x) => x.id === param && isScheda(x));
  if (param !== 'nuova' && !p) {                                // missing, deleted or a legacy program: back to the list
    location.hash = '#schede';
    return;
  }
  if (!draft || draft.key !== param) draft = p ? fromScheda(p) : blank(doc, today);
  let stale = false;
  if (p && draft.updatedAt !== (p.updatedAt ?? null)) {         // stored scheda changed while the form is open
    if (own) draft.updatedAt = p.updatedAt ?? null;
    else if (draft.dirty) stale = true;
    else draft = fromScheda(p);
  }
  const d = draft;
  const ro = isReadOnly();
  const days = p ? schedaDays(doc, p) : [];
  const staleBox = stale ? `<div class="card form"><p class="error" role="alert">Questa scheda è stata modificata su un altro dispositivo.</p>
      <button type="button" class="btn" data-act="reload">Ricarica</button></div>` : '';

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

    <h2 class="list-title">Periodo</h2>
    <div class="card form">
      <div class="two">
        <label class="field">Inizio<input type="date" data-f="from" value="${esc(d.from)}" required></label>
        <label class="field">Fine (facoltativa)<input type="date" data-f="to" value="${esc(d.to)}" min="${esc(d.from)}"></label>
      </div>
      <small class="muted">Nei giorni del periodo la scheda compare in Oggi. Senza fine resta in corso.</small>
    </div>

    <h2 class="list-title">Giorni</h2>
    <div class="card">
      ${days.length ? `<ul class="rows day-list">${days.map((t, i) => dayRow(doc, p, t, i, days.length, ro)).join('')}</ul>`
    : `<p class="muted" style="margin:0 0 12px">${p ? 'Nessun giorno: aggiungi il primo.' : 'Dai un nome alla scheda, poi aggiungi i giorni.'}</p>`}
      <button type="button" class="btn block" data-act="addday" style="margin-top:8px">+ Aggiungi giorno</button>
    </div>

    <div class="card form" style="margin-top:12px">
      <div class="errors" role="alert"></div>
      ${ro ? '<p class="error">Modalità sola lettura: impossibile salvare.</p>' : ''}
      <button type="button" class="btn primary block" data-act="save">Salva</button>
      ${p ? `<div class="danger-zone"><button type="button" class="btn danger" data-act="delete" ${ro ? 'disabled' : ''}>Elimina scheda</button></div>` : ''}
    </div>`;

  const save = el.querySelector('[data-act=save]');
  const addDay = el.querySelector('[data-act=addday]');
  const errBox = el.querySelector('.errors');
  const fail = (m) => { errBox.innerHTML = `<p class="error">${esc(m)}</p>`; };
  const status = () => {
    const msgs = validate(d);
    errBox.innerHTML = msgs.map((m) => `<p class="error">${esc(m)}</p>`).join('');
    save.disabled = ro || msgs.length > 0;
    addDay.disabled = ro || msgs.length > 0;
  };
  status();

  const touch = (f) => { d.touched.add(f); d.dirty = true; };

  /** Saves the form; a new scheda is created first. Returns the scheda id, or null (message shown). */
  function persist() {
    const id = mutate(() => saveScheda(buildFields(d)));
    if (id == null) fail(SAVE_FAIL);
    return id;
  }

  el.oninput = el.onchange = (e) => {
    const t = e.target;
    if (t.dataset.f === 'color') {
      if (t.checked) { d.color = t.value; touch('color'); }
    } else if (t.dataset.f) {
      d[t.dataset.f] = t.value;
      touch(t.dataset.f);
      if (t.dataset.f === 'from') el.querySelector('[data-f=to]').min = t.value;
      if (t.dataset.f === 'emoji') el.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('on', b.dataset.emoji === d.emoji));
      status();
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
      draft = p ? fromScheda(p) : blank(doc, today);
      refresh();
    } else if (a === 'addday') {
      if (ro || validate(d).length) return;
      let sid = p?.id ?? null;
      if (!p) {                                          // the day needs a saved scheda; the day itself is created on its Save
        sid = persist();
        if (sid == null) return;
        draft = null;
      }
      location.hash = `#scheda/${encodeURIComponent(sid)}/giorno/nuovo`;
    } else if (a === 'up' || a === 'down' || a === 'dup' || a === 'rm') {
      const tid = b.closest('[data-id]').dataset.id;
      if (a === 'up' || a === 'down') mutate(() => moveSchedaDay(tid, a === 'up' ? -1 : 1));
      else if (a === 'dup') mutate(() => duplicateSchedaDay(tid));
      else if (confirm('Eliminare questo giorno? Le sessioni già svolte restano nello storico.')) mutate(() => deleteSchedaDay(tid));
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
