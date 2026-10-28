// "Programma" (#programma/<id|nuovo>): create / edit a training program, activate, delete.
import {
  getDoc, saveProgram, activateProgram, deleteProgram, isReadOnly,
} from '../store.js';
import { todayKey, fromKey, toKey } from '../logic.js';
import {
  esc, safeColor, fmtFull, DAY_LETTERS, DAY_SHORT,
} from '../ui.js';
import { openSheet } from './exercises.js';
import { pickerRows, KIND_LABELS } from './calendar.js';

const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MAX_WEEKS = 8;

// Unsaved form state lives here (not in the DOM), so store events that redraw the view never lose it.
let draft = null;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#programma/')) draft = null;
  });
}

const emptyWeeks = () => Array.from({ length: MAX_WEEKS }, () => Array.from({ length: 7 }, () => []));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toKey(fromKey(s)) === s;
const tplOf = (doc, id) => doc.templates.find((t) => t.id === id) ?? null;
const usable = (doc, id) => {
  const t = tplOf(doc, id);
  return !!t && !t.deleted && !t.archived;
};

function fromProgram(p) {
  const weeks = emptyWeeks();
  (p.weeks ?? []).slice(0, MAX_WEEKS).forEach((w, k) => {
    for (let g = 0; g < 7; g++) weeks[k][g] = [...(w?.[g] ?? [])];
  });
  return {
    key: p.id, id: p.id, name: p.name, kind: p.kind, n: Math.min(MAX_WEEKS, Math.max(1, (p.weeks ?? []).length || 1)),
    weeks, seq: [...(p.seq ?? [])], days: [...(p.days ?? [])],
  };
}

const blank = () => ({
  key: 'nuovo', id: null, name: '', kind: 'week', n: 1, weeks: emptyWeeks(), seq: [], days: [],
});

/** Only the fields that matter for the chosen kind; the others are saved empty. */
function buildFields(d) {
  const f = {
    name: d.name.trim(), kind: d.kind, weeks: [], seq: [], days: null,
  };
  if (d.id) f.id = d.id;
  if (d.kind === 'week') f.weeks = d.weeks.slice(0, d.n).map((w) => w.map((day) => [...day]));
  else if (d.kind === 'rotation') {
    f.seq = [...d.seq];
    f.days = d.days.length ? [...d.days].sort((a, b) => a - b) : null;
  }
  return f;
}

const validate = (d) => {
  const n = d.name.trim().length;
  return n < 1 || n > 40 ? ['Il nome deve avere da 1 a 40 caratteri.'] : [];
};

function pickTemplate(title, onPick) {
  const { box, close } = openSheet(`<h2>${esc(title)}</h2><ul class="rows">${pickerRows(getDoc())}</ul>
    <button type="button" class="btn" data-act="cancel">Annulla</button>`);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    close();
    if (b.dataset.tpl) onPick(b.dataset.tpl);
  };
}

function chip(doc, id, attrs) {
  const t = tplOf(doc, id);
  const ok = usable(doc, id);
  return `<button type="button" class="chip tpl-chip" style="--c:${safeColor(t?.color)}" ${attrs}
    aria-label="Rimuovi ${esc(t?.name ?? 'scheda rimossa')}">${ok ? esc(t.emoji || '💪') : '⚠️'} ${esc(ok ? t.name : 'Scheda non disponibile')} ✕</button>`;
}

function weekGrid(doc, d) {
  let out = '';
  for (let w = 0; w < d.n; w++) {
    out += `<section class="card"><h3>Settimana ${w + 1}</h3>${DAY_SHORT.map((label, g) => `
      <div class="wk-row"><span class="wk-day" title="${DAY_NAMES[g]}">${label}</span>
        <div class="chips">${d.weeks[w][g].map((id, k) => chip(doc, id, `data-rm="${w}.${g}.${k}"`)).join('')}
          <button type="button" class="chip" data-addcell="${w}.${g}" aria-label="Aggiungi scheda: ${DAY_NAMES[g]}, settimana ${w + 1}">+</button></div></div>`).join('')}
    </section>`;
  }
  return out;
}

function rotationForm(doc, d) {
  const rows = d.seq.map((id, i) => {
    const t = tplOf(doc, id);
    const ok = usable(doc, id);
    return `<li><span class="badge" style="--c:${safeColor(t?.color)}">${ok ? esc(t.emoji || '💪') : '⚠️'}</span>
      <div class="grow"><b>${i + 1}. ${esc(ok ? t.name : 'Scheda non disponibile')}</b></div>
      <span class="order"><button type="button" data-act="up" data-i="${i}" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-act="down" data-i="${i}" aria-label="Sposta giù" ${i === d.seq.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" data-act="del" data-i="${i}" aria-label="Rimuovi">✕</button></span></li>`;
  }).join('');
  return `<fieldset><legend>Sequenza di schede</legend>
      ${d.seq.length ? `<ul class="rows seq">${rows}</ul>` : '<p class="muted">Nessuna scheda nella sequenza.</p>'}
      <button type="button" class="btn" data-act="addseq">+ Aggiungi scheda</button></fieldset>
    <fieldset><legend>Giorni di allenamento (facoltativi)</legend>
      <div class="days-row">${DAY_LETTERS.map((L, g) => `<label class="pick"><input type="checkbox" data-day="${g + 1}"
        ${d.days.includes(g + 1) ? 'checked' : ''} aria-label="${DAY_NAMES[g]}"><span>${L}</span></label>`).join('')}</div>
      <small class="muted">Senza giorni scelti la rotazione non pianifica sul calendario: scegli la scheda da Oggi.</small></fieldset>`;
}

function openActivate(ro) {
  const today = todayKey();
  const { box, close } = openSheet(`<h2>Attiva programma</h2>
    <div class="form"><label class="field">Data di inizio<input type="date" name="from" value="${today}"></label>
      <label class="field">Data di fine (facoltativa)<input type="date" name="to" value=""></label>
      <p class="error" role="alert" hidden></p></div>
    <button type="button" class="btn primary center" data-act="go" ${ro ? 'disabled' : ''}>Attiva</button>
    <button type="button" class="btn" data-act="cancel">Annulla</button>`);
  const err = (m) => {
    const p = box.querySelector('.error');
    p.textContent = m;
    p.hidden = false;
  };
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'cancel') { close(); return; }
    if (b.dataset.act !== 'go' || !draft || validate(draft).length) return;
    const from = box.querySelector('[name=from]').value;
    const to = box.querySelector('[name=to]').value || null;
    if (!isDate(from)) { err('Scegli una data di inizio valida.'); return; }
    if (to != null && (!isDate(to) || to < from)) { err('La data di fine non può precedere l’inizio.'); return; }
    const cur = draft.id ? getDoc().programs.find((p) => p.id === draft.id) : null;
    const concluded = !!cur && cur.to != null && cur.to < today;
    let id;
    if (concluded) {                                   // history stays unchanged: edits go to the copy
      id = activateProgram(draft.id, from, to);
      if (id != null) saveProgram({ ...buildFields(draft), id });
    } else {
      id = saveProgram(buildFields(draft));
      if (id != null) id = activateProgram(id, from, to);
    }
    if (id == null) { err('Modalità sola lettura: impossibile salvare.'); return; }
    close();
    draft = null;
    location.hash = '#calendario';
  };
}

export function render(el, ctx) {
  const { doc, param } = ctx;
  const p = param === 'nuovo' ? null : doc.programs.find((x) => x.id === param && !x.deleted);
  if (param !== 'nuovo' && !p) {
    location.hash = '#calendario';
    return;
  }
  if (!draft || draft.key !== param) draft = p ? fromProgram(p) : blank();
  const d = draft;
  const ro = isReadOnly();
  const rerender = () => render(el, ctx);
  const info = p && p.from != null
    ? `<p class="muted">Attivo dal ${fmtFull(p.from)}${p.to != null ? ` al ${fmtFull(p.to)}` : ''}</p>` : '';

  el.innerHTML = `
    <header class="top"><a class="back" href="#calendario">‹ Calendario</a></header>
    <h1 style="margin-bottom:16px">${p ? 'Modifica programma' : 'Nuovo programma'}</h1>
    <div class="card form">
      ${info}
      <label class="field">Nome<input data-f="name" maxlength="40" value="${esc(d.name)}" placeholder="Es. Settimana A/B" autocomplete="off"></label>
      <fieldset><legend>Tipo</legend>
        <div class="seg">${['week', 'rotation', 'free'].map((k) => `<label class="pick"><input type="radio" name="kind" value="${k}"
          ${d.kind === k ? 'checked' : ''}><span>${KIND_LABELS[k]}</span></label>`).join('')}</div>
      </fieldset>
      ${d.kind === 'week' ? `<label class="field">Settimane del ciclo
        <select data-f="n">${Array.from({ length: MAX_WEEKS }, (_, k) => `<option value="${k + 1}" ${d.n === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></label>` : ''}
      ${d.kind === 'rotation' ? rotationForm(doc, d) : ''}
      ${d.kind === 'free' ? '<p class="muted">Programma libero: nessun allenamento previsto.</p>' : ''}
    </div>
    ${d.kind === 'week' ? weekGrid(doc, d) : ''}
    <div class="card form">
      <div class="errors" role="alert"></div>
      ${ro ? '<p class="error">Modalità sola lettura: impossibile salvare.</p>' : ''}
      <button type="button" class="btn primary block" data-act="save">Salva</button>
      <button type="button" class="btn block" data-act="activate">Attiva…</button>
      ${p ? `<div class="danger-zone"><button type="button" class="btn danger" data-act="delete" ${ro ? 'disabled' : ''}>Elimina</button></div>` : ''}
    </div>`;

  const save = el.querySelector('[data-act=save]');
  const act = el.querySelector('[data-act=activate]');
  const errBox = el.querySelector('.errors');
  const status = () => {
    const msgs = validate(d);
    errBox.innerHTML = msgs.map((m) => `<p class="error">${esc(m)}</p>`).join('');
    save.disabled = ro || msgs.length > 0;
    act.disabled = ro || msgs.length > 0;
  };
  status();

  el.oninput = el.onchange = (e) => {
    const t = e.target;
    if (t.name === 'kind') {
      if (t.checked) { d.kind = t.value; rerender(); }
    } else if (t.dataset.f === 'name') {
      d.name = t.value;
      status();
    } else if (t.dataset.f === 'n') {
      if (e.type === 'change') { d.n = +t.value; rerender(); }
    } else if (t.dataset.day) {
      const g = +t.dataset.day;
      d.days = t.checked ? [...new Set([...d.days, g])] : d.days.filter((x) => x !== g);
    }
  };

  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.act;
    const i = +b.dataset.i;
    if (b.dataset.rm) {
      const [w, g, k] = b.dataset.rm.split('.').map(Number);
      d.weeks[w][g].splice(k, 1);
    } else if (b.dataset.addcell) {
      const [w, g] = b.dataset.addcell.split('.').map(Number);
      pickTemplate(`${DAY_NAMES[g]}, settimana ${w + 1}`, (id) => { d.weeks[w][g].push(id); rerender(); });
      return;
    } else if (a === 'addseq') {
      pickTemplate('Aggiungi alla sequenza', (id) => { d.seq.push(id); rerender(); });
      return;
    } else if (a === 'del') d.seq.splice(i, 1);
    else if (a === 'up' || a === 'down') {
      const j = a === 'up' ? i - 1 : i + 1;
      [d.seq[i], d.seq[j]] = [d.seq[j], d.seq[i]];
    } else if (a === 'save') {
      if (validate(d).length) return;
      const id = saveProgram(buildFields(d));
      if (id == null) return;
      draft = null;
      location.hash = '#calendario';
      return;
    } else if (a === 'activate') {
      if (!validate(d).length) openActivate(ro);
      return;
    } else if (a === 'delete') {
      if (confirm(`Eliminare "${p.name}"? Le sessioni già svolte restano nello storico.`)) {
        deleteProgram(p.id);
        draft = null;
        location.hash = '#calendario';
      }
      return;
    } else return;
    rerender();
  };
}
