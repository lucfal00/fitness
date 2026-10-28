// "Esercizi": exercise library (rename / hide) and own exercises (create / edit / delete).
import { listExercises, resolveExercise, GROUPS, KINDS } from '../library.js';
import { saveExercise, editLibraryExercise, deleteExercise, isReadOnly } from '../store.js';
import { esc, GROUP_LABELS } from '../ui.js';

export const KIND_LABELS = { weight: 'Pesi', body: 'Corpo libero', cardio: 'Cardio', sport: 'Sport' };

const filter = { q: '', group: '', kind: '' };               // survives the re-render after each store change

/** Search text + group + kind filter over an exercise list. */
export function filterExercises(list, { q, group, kind }) {
  const needle = q.trim().toLowerCase();
  return list.filter((e) => (!needle || e.name.toLowerCase().includes(needle))
    && (!group || e.group === group || (e.also ?? []).includes(group))
    && (!kind || e.kind === kind));
}

export const exerciseMeta = (e) => [KIND_LABELS[e.kind], e.group ? GROUP_LABELS[e.group] : null,
  e.kind === 'body' && e.measure === 'time' ? 'a tempo' : null].filter(Boolean).join(' · ');

/** Filter controls (search + group/kind chips); `prefix` keeps ids unique when two are on screen. */
export function filterBar(f) {
  const chip = (attr, value, label, on) => `<button type="button" class="chip ${on ? 'on' : ''}" data-${attr}="${value}"
    aria-pressed="${on}">${label}</button>`;
  return `<input type="text" class="ex-search" placeholder="Cerca esercizio" value="${esc(f.q)}" aria-label="Cerca esercizio" autocomplete="off">
    <div class="chips" role="group" aria-label="Tipo">${chip('kind', '', 'Tutti', !f.kind)}
      ${KINDS.map((k) => chip('kind', k, KIND_LABELS[k], f.kind === k)).join('')}</div>
    <div class="chips" role="group" aria-label="Gruppo muscolare">${chip('group', '', 'Tutti i gruppi', !f.group)}
      ${GROUPS.map((g) => chip('group', g, GROUP_LABELS[g], f.group === g)).join('')}</div>`;
}

/** Wire filterBar events on `root`; calls `change()` after the state in `f` was updated. */
export function bindFilterBar(root, f, change) {
  root.querySelector('.ex-search').oninput = (e) => {
    f.q = e.target.value;
    change(false);
  };
  root.onclick = ((prev) => (e) => {
    const b = e.target.closest('button.chip[data-kind], button.chip[data-group]');
    if (b && root.contains(b)) {
      if ('kind' in b.dataset) f.kind = b.dataset.kind;
      else f.group = b.dataset.group;
      change(true);
      return;
    }
    prev?.(e);
  })(root.onclick);
}

/** Bottom sheet appended to <body> (survives view re-renders). Returns { box, close }. */
export function openSheet(html) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const box = back.firstElementChild;
  const opener = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape') close(); };       // eslint-disable-line no-use-before-define
  function close() {
    document.removeEventListener('keydown', onKey);
    back.remove();
    if (opener && document.contains(opener)) opener.focus();
  }
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  box.querySelector('input, select, button')?.focus();
  return { box, close };
}

/** Create / edit sheet for an own exercise. `onSaved(id)` runs after a successful save. */
export function openExerciseSheet({ ex = null, name = '', onSaved = () => {} } = {}) {
  const v = ex ?? { name, kind: 'weight', measure: 'reps', group: 'petto', also: [] };
  const { box, close } = openSheet(`
    <h2>${ex ? 'Modifica esercizio' : 'Nuovo esercizio'}</h2>
    <form class="form" novalidate>
      <label class="field">Nome<input name="name" maxlength="40" value="${esc(v.name)}" autocomplete="off" placeholder="Es. Hip thrust"></label>
      <fieldset><legend>Tipo</legend>
        <div class="seg">${KINDS.map((k) => `<label class="pick"><input type="radio" name="kind" value="${k}"
          ${v.kind === k ? 'checked' : ''} ${ex ? 'disabled' : ''}><span>${KIND_LABELS[k]}</span></label>`).join('')}</div>
      </fieldset>
      <fieldset class="if-body"><legend>Misura</legend>
        <div class="seg"><label class="pick"><input type="radio" name="measure" value="reps" ${v.measure !== 'time' ? 'checked' : ''}><span>Ripetizioni</span></label>
          <label class="pick"><input type="radio" name="measure" value="time" ${v.measure === 'time' ? 'checked' : ''}><span>Tempo</span></label></div>
      </fieldset>
      <label class="field if-group">Gruppo principale
        <select name="group">${GROUPS.map((g) => `<option value="${g}" ${v.group === g ? 'selected' : ''}>${GROUP_LABELS[g]}</option>`).join('')}</select></label>
      <fieldset class="if-group"><legend>Gruppi secondari</legend>
        <div class="chips">${GROUPS.map((g) => `<label class="chip also" data-g="${g}"><input type="checkbox" class="sr-only" name="also" value="${g}"
          ${(v.also ?? []).includes(g) ? 'checked' : ''}>${GROUP_LABELS[g]}</label>`).join('')}</div>
      </fieldset>
      <p class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Salva</button>
      <button class="btn block" type="button" data-act="cancel">Annulla</button>
    </form>`);
  const form = box.querySelector('form');
  const error = form.querySelector('.error');
  const kindNow = () => (ex ? ex.kind : form.kind.value);
  const sync = () => {
    const k = kindNow();
    form.querySelector('.if-body').hidden = k !== 'body';
    form.querySelectorAll('.if-group').forEach((n) => { n.hidden = k !== 'weight' && k !== 'body'; });
    const main = form.group.value;
    form.querySelectorAll('.also').forEach((c) => {
      c.hidden = c.dataset.g === main;
      if (c.dataset.g === main) c.querySelector('input').checked = false;
      c.classList.toggle('on', c.querySelector('input').checked);
    });
  };
  form.onchange = sync;
  sync();
  form.querySelector('[data-act=cancel]').onclick = close;
  form.onsubmit = (e) => {
    e.preventDefault();
    const nm = form.name.value.trim();
    const k = kindNow();
    if (!nm || nm.length > 40) {
      error.textContent = 'Il nome deve avere da 1 a 40 caratteri.';
      error.hidden = false;
      return;
    }
    const grouped = k === 'weight' || k === 'body';
    const fields = {
      ...(ex ? { id: ex.id } : {}),
      name: nm,
      kind: k,
      group: grouped ? form.group.value : null,
      also: grouped ? [...form.querySelectorAll('[name=also]:checked')].map((c) => c.value) : [],
      ...(k === 'body' ? { measure: form.measure.value } : {}),
    };
    const id = saveExercise(fields);
    if (id == null) {
      error.textContent = 'Modalità sola lettura: impossibile salvare.';
      error.hidden = false;
      return;
    }
    close();
    onSaved(id);
  };
}

function rowHtml(e, doc, hidden) {
  const own = e.id.startsWith('x_');
  const btns = hidden
    ? '<button class="btn small" data-act="show">Mostra</button>'
    : own
      ? '<button class="btn small" data-act="edit">Modifica</button><button class="btn small danger" data-act="delete">Elimina</button>'
      : '<button class="btn small" data-act="rename">Rinomina</button><button class="btn small" data-act="hide">Nascondi</button>';
  const renamed = !own && doc.exerciseEdits[e.id]?.name != null;
  return `<li data-id="${esc(e.id)}">
    <span class="grow"><b>${esc(e.name)}</b><small>${esc(exerciseMeta(e))}${renamed ? ' · rinominato' : ''}</small></span>
    <span class="btn-row ex-actions">${btns}</span></li>`;
}

function openRename(e, doc, ctx) {
  const { box, close } = openSheet(`
    <h2>Rinomina esercizio</h2>
    <form class="form" novalidate>
      <label class="field">Nome<input name="name" maxlength="40" value="${esc(e.name)}" autocomplete="off"></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Salva</button>
      <button class="btn block" type="button" data-act="cancel">Annulla</button>
    </form>`);
  const form = box.querySelector('form');
  form.querySelector('[data-act=cancel]').onclick = close;
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const nm = form.name.value.trim();
    if (!nm || nm.length > 40) {
      const p = form.querySelector('.error');
      p.textContent = 'Il nome deve avere da 1 a 40 caratteri.';
      p.hidden = false;
      return;
    }
    close();
    editLibraryExercise(e.id, { name: nm });
    ctx.refresh();
  };
}

export function render(el, ctx) {
  const { doc } = ctx;
  const visible = listExercises(doc);
  const shownIds = new Set(visible.map((e) => e.id));
  const hiddenList = listExercises(doc, { hidden: true }).filter((e) => !shownIds.has(e.id));
  const ro = isReadOnly();

  el.innerHTML = `
    <header class="top"><a class="back" href="#schede">‹ Schede</a><div class="grow"></div>
      <button class="btn primary" data-act="new" ${ro ? 'disabled' : ''}>+ Nuovo</button></header>
    <h1 style="margin-bottom:16px">Esercizi</h1>
    <div class="form ex-filters" style="margin-bottom:12px">${filterBar(filter)}</div>
    <ul class="card list rows ex-list"></ul>
    <details class="card hid" ${hiddenList.length ? '' : 'hidden'}><summary>Nascosti (${hiddenList.length})</summary>
      <ul class="rows hid-list"></ul></details>`;

  const list = el.querySelector('.ex-list');
  const hidList = el.querySelector('.hid-list');
  const paint = () => {
    const rows = filterExercises(visible, filter);
    list.innerHTML = rows.length ? rows.map((e) => rowHtml(e, doc, false)).join('')
      : '<li><span class="muted">Nessun esercizio trovato.</span></li>';
    hidList.innerHTML = filterExercises(hiddenList, filter).map((e) => rowHtml(e, doc, true)).join('');
  };
  paint();

  bindFilterBar(el.querySelector('.ex-filters'), filter, (full) => {
    if (full) render(el, ctx);                       // chips change: redraw (search keeps focus: no redraw while typing)
    else paint();
  });

  el.onclick = (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'new') {
      openExerciseSheet({ name: filter.q.trim().slice(0, 40), onSaved: ctx.refresh });
      return;
    }
    const li = b.closest('[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const ex = resolveExercise(doc, id);
    if (!ex) return;
    if (b.dataset.act === 'edit') openExerciseSheet({ ex, onSaved: ctx.refresh });
    else if (b.dataset.act === 'rename') openRename(ex, doc, ctx);
    else if (b.dataset.act === 'hide') editLibraryExercise(id, { hidden: true });
    else if (b.dataset.act === 'show') editLibraryExercise(id, { hidden: false });
    else if (b.dataset.act === 'delete' && confirm(`Eliminare "${ex.name}"? Lo storico resta leggibile.`)) deleteExercise(id);
  };
}
