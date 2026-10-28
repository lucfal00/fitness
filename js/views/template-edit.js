// "Scheda": create / edit a workout template (items, sets, supersets), with validation.
import { resolveExercise, listExercises } from '../library.js';
import {
  getDoc, saveTemplate, deleteTemplate, archiveTemplate, duplicateTemplate, isReadOnly,
} from '../store.js';
import { esc, safeColor, fmtKg, fmtDuration, parseNum, COLORS } from '../ui.js';
import {
  openSheet, openExerciseSheet, filterBar, bindFilterBar, filterExercises, exerciseMeta,
} from './exercises.js';

const EMOJIS = ['💪', '🏋️', '🦵', '🏃', '🚴', '🧘', '🔥', '⚡', '🥊', '🏊', '🤸', '🎯'];

// Unsaved form state lives here (not in the DOM), so store events that redraw the view never lose it.
let draft = null;
let refresh = () => {};
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#scheda/')) draft = null;
  });
}

// ---- Numbers and durations (all form values are kept as strings) ---------

const INT = /^\d+$/;
const DEC = /^\d+([.,]\d+)?$/;
const posInt = (s) => INT.test(s.trim()) && Number(s) > 0;
const posNum = (s) => DEC.test(s.trim()) && parseNum(s) > 0;

/** "20" = minutes, "m:ss", "h:mm:ss" to seconds; NaN when invalid or zero. */
function parseDur(s) {
  const v = s.trim();
  let sec = NaN;
  if (DEC.test(v)) sec = Math.round(parseNum(v) * 60);
  else if (/^\d+:[0-5]?\d$/.test(v)) sec = Number(v.split(':')[0]) * 60 + Number(v.split(':')[1]);
  else if (/^\d+:[0-5]\d:[0-5]\d$/.test(v)) {
    const [h, m, x] = v.split(':').map(Number);
    sec = h * 3600 + m * 60 + x;
  }
  return sec > 0 ? sec : NaN;
}

// ---- Kinds ----------------------------------------------------------------

/** 'reps' (weight / body by reps), 'time' (body by time), 'cardio', 'sport'. */
function shapeOf(doc, id) {
  const ex = resolveExercise(doc, id);
  if (!ex) return 'reps';
  if (ex.kind === 'cardio' || ex.kind === 'sport') return ex.kind;
  if (ex.kind === 'body') return ex.measure === 'time' ? 'time' : 'repsBody';
  return 'reps';
}
const isStrength = (shape) => shape === 'reps' || shape === 'repsBody' || shape === 'time';

// ---- Template <-> draft ---------------------------------------------------

function toRow(s, shape) {
  const w = !!s.w;
  if (shape === 'cardio') return { km: s.km != null ? fmtKg(s.km) : '', dur: s.sec ? fmtDuration(s.sec) : '' };
  if (shape === 'sport') return { dur: s.sec ? fmtDuration(s.sec) : '' };
  if (shape === 'time') return { w, sec: s.sec != null ? String(s.sec) : '' };
  const [min, max] = s.reps ?? [];
  return {
    w, min: min != null ? String(min) : '', max: max != null && max !== min ? String(max) : '',
    kg: shape === 'reps' && s.kg != null ? fmtKg(s.kg) : '',
  };
}

function fromTemplate(doc, t) {
  return {
    key: t.id, id: t.id, name: t.name, emoji: t.emoji || '💪', color: safeColor(t.color),
    items: t.items.map((it, i) => {
      const shape = shapeOf(doc, it.ex);
      return {
        ex: it.ex,
        link: it.group != null && t.items[i + 1]?.group === it.group,
        rest: it.rest != null ? String(it.rest) : '',
        note: it.note ?? '',
        sets: it.sets.map((s) => toRow(s, shape)),
      };
    }),
  };
}

const blank = (doc) => ({
  key: 'nuova', id: null, name: '', emoji: '💪',
  color: COLORS[doc.templates.filter((t) => !t.deleted).length % COLORS.length], items: [],
});

function newItem(doc, ex) {
  const shape = shapeOf(doc, ex);
  const three = (row) => [0, 1, 2].map(() => ({ ...row }));
  const sets = {
    reps: three({ w: false, min: '8', max: '10', kg: '' }),
    repsBody: three({ w: false, min: '10', max: '', kg: '' }),
    time: three({ w: false, sec: '30' }),
    cardio: [{ km: '', dur: '' }],
    sport: [{ dur: '' }],
  }[shape];
  return { ex, link: false, rest: '', note: '', sets };
}

/** Linked-to-next flags only count between two strength items. */
const canLink = (doc, items, i) => i < items.length - 1
  && isStrength(shapeOf(doc, items[i].ex)) && isStrength(shapeOf(doc, items[i + 1].ex));

/** Draft set row to a template set, or null when invalid. */
function toSet(r, shape) {
  if (shape === 'cardio') {
    const km = r.km.trim() ? parseNum(r.km) : null;
    const sec = r.dur.trim() ? parseDur(r.dur) : null;
    return { ...(km != null ? { km } : {}), ...(sec != null ? { sec } : {}) };
  }
  if (shape === 'sport') return { sec: parseDur(r.dur) };
  if (shape === 'time') return { ...(r.w ? { w: true } : {}), sec: Number(r.sec) };
  const min = Number(r.min);
  return {
    ...(r.w ? { w: true } : {}),
    reps: [min, r.max.trim() ? Number(r.max) : min],
    ...(shape === 'reps' && r.kg.trim() ? { kg: parseNum(r.kg) } : {}),
  };
}

/** Validation messages (Italian), empty when the draft can be saved. */
function validate(doc, d) {
  const out = [];
  const name = d.name.trim();
  if (!name) out.push('Inserisci il nome della scheda.');
  else if (name.length > 40) out.push('Il nome può avere al massimo 40 caratteri.');
  if (!d.items.length) out.push('Aggiungi almeno un esercizio.');
  d.items.forEach((it) => {
    const shape = shapeOf(doc, it.ex);
    const label = resolveExercise(doc, it.ex)?.name ?? 'Esercizio';
    let msg = '';
    if (it.rest.trim() && !posInt(it.rest)) msg = 'il recupero deve essere un numero di secondi maggiore di 0.';
    else if (shape === 'cardio') {
      const hasKm = it.sets[0].km.trim();
      const hasDur = it.sets[0].dur.trim();
      if (!hasKm && !hasDur) msg = 'indica distanza e/o durata.';
      else if (hasKm && !posNum(it.sets[0].km)) msg = 'la distanza deve essere maggiore di 0.';
      else if (hasDur && Number.isNaN(parseDur(it.sets[0].dur))) msg = 'durata non valida (es. 20 oppure 20:00).';
    } else if (shape === 'sport') {
      if (Number.isNaN(parseDur(it.sets[0].dur))) msg = 'indica una durata valida (es. 60 oppure 60:00).';
    } else if (!it.sets.some((s) => !s.w)) msg = 'serve almeno una serie di lavoro.';
    else {
      for (const s of it.sets) {
        if (shape === 'time') {
          if (!posInt(s.sec)) { msg = 'i secondi devono essere maggiori di 0.'; break; }
        } else if (!posInt(s.min)) { msg = 'le ripetizioni devono essere maggiori di 0.'; break; }
        else if (s.max.trim() && (!posInt(s.max) || Number(s.max) < Number(s.min))) {
          msg = 'le ripetizioni massime devono essere almeno pari alle minime.';
          break;
        } else if (s.kg.trim() && shape === 'reps' && !posNum(s.kg)) { msg = 'i kg devono essere maggiori di 0.'; break; }
      }
    }
    if (msg) out.push(`${label}: ${msg}`);
  });
  return out;
}

/** Template fields the form edits (never a whole stale clone: saveTemplate merges with Object.assign). */
function buildFields(doc, d) {
  let n = 0;
  let cur = null;
  const items = d.items.map((it, i) => {
    const shape = shapeOf(doc, it.ex);
    const linkedPrev = i > 0 && d.items[i - 1].link && canLink(doc, d.items, i - 1);
    const linked = it.link && canLink(doc, d.items, i);
    let group = null;
    if (linked || linkedPrev) {
      if (!linkedPrev) cur = `g${++n}`;
      group = cur;
    }
    return {
      ex: it.ex,
      group,
      ...(it.rest.trim() && isStrength(shape) ? { rest: Number(it.rest) } : {}),
      note: it.note.trim(),
      sets: it.sets.map((r) => toSet(r, shape)),
    };
  });
  return {
    ...(d.id ? { id: d.id } : {}), name: d.name.trim(), emoji: d.emoji.trim() || '💪', color: d.color, items,
  };
}

// ---- Rendering --------------------------------------------------------------

const input = (attrs, value, extra = '') => `<input ${attrs} value="${esc(value)}" ${extra}>`;

function setRows(it, i, shape) {
  if (shape === 'cardio') {
    return `<div class="two">
      <label class="field">Distanza (km)${input(`data-i="${i}" data-s="0" data-k="km" inputmode="decimal"`, it.sets[0].km, 'placeholder="facoltativa"')}</label>
      <label class="field">Durata (min o mm:ss)${input(`data-i="${i}" data-s="0" data-k="dur" inputmode="text"`, it.sets[0].dur, 'placeholder="es. 20:00"')}</label></div>`;
  }
  if (shape === 'sport') {
    return `<label class="field">Durata (min o mm:ss)${input(`data-i="${i}" data-s="0" data-k="dur" inputmode="text"`, it.sets[0].dur, 'placeholder="es. 60"')}</label>`;
  }
  let work = 0;
  const rows = it.sets.map((s, j) => {
    const lbl = s.w ? '<span class="lbl warm" title="Riscaldamento">R</span>' : `<span class="lbl">${++work}</span>`;
    const at = (k) => `data-i="${i}" data-s="${j}" data-k="${k}"`;
    const fields = shape === 'time'
      ? input(`${at('sec')} inputmode="numeric" aria-label="Secondi"`, s.sec, 'placeholder="sec"')
      : `${input(`${at('min')} inputmode="numeric" aria-label="Ripetizioni minime"`, s.min, 'placeholder="rip."')}
         ${input(`${at('max')} inputmode="numeric" aria-label="Ripetizioni massime (facoltative)"`, s.max, 'placeholder="max"')}
         ${shape === 'reps' ? input(`${at('kg')} inputmode="decimal" aria-label="Chilogrammi (facoltativi)"`, s.kg, 'placeholder="kg"') : ''}`;
    return `<div class="tset n${shape === 'reps' ? 3 : shape === 'time' ? 1 : 2}">${lbl}${fields}
      <button type="button" class="icon-btn small" data-act="delset" data-i="${i}" data-s="${j}" aria-label="Rimuovi serie ${j + 1}">✕</button></div>`;
  }).join('');
  const cap = shape === 'time' ? 'Secondi per serie'
    : `Ripetizioni (min e max; senza max sono fisse)${shape === 'reps' ? ' · kg iniziali facoltativi' : ''}`;
  return `<small class="muted">${cap}</small>${rows}
    <div class="btn-row"><button type="button" class="btn small" data-act="addset" data-i="${i}">+ Serie</button>
      <button type="button" class="btn small" data-act="addwarm" data-i="${i}">+ Riscaldamento</button></div>`;
}

function itemCard(doc, d, it, i) {
  const ex = resolveExercise(doc, it.ex);
  const shape = shapeOf(doc, it.ex);
  const n = d.items.length;
  const linkedNext = it.link && canLink(doc, d.items, i);
  const linkedPrev = i > 0 && d.items[i - 1].link && canLink(doc, d.items, i - 1);
  const meta = ex ? exerciseMeta(ex) : 'Esercizio non più disponibile';
  return `<section class="card tpl-ex ${linkedNext || linkedPrev ? 'grouped' : ''}" data-item="${i}">
    <div class="ex-head"><span class="grow"><b>${esc(ex?.name ?? 'Esercizio rimosso')}</b>
        <small class="muted" style="display:block">${esc(meta)}${linkedNext || linkedPrev ? ' · superserie' : ''}</small></span>
      <button type="button" class="icon-btn small" data-act="up" data-i="${i}" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="icon-btn small" data-act="down" data-i="${i}" aria-label="Sposta giù" ${i === n - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="icon-btn small" data-act="del" data-i="${i}" aria-label="Rimuovi esercizio">✕</button></div>
    ${setRows(it, i, shape)}
    ${isStrength(shape) ? `<label class="field">Recupero (s)${input(`data-i="${i}" data-k="rest" inputmode="numeric"`, it.rest, 'placeholder="predefinito"')}</label>` : ''}
    <label class="field">Nota${input(`data-i="${i}" data-k="note" maxlength="120"`, it.note, 'autocomplete="off"')}</label>
    ${canLink(doc, d.items, i) ? `<label class="switch-row"><span>Unisci al successivo (superserie)</span>
      <span class="switch"><input type="checkbox" data-i="${i}" data-k="link" ${it.link ? 'checked' : ''}><span></span></span></label>` : ''}
  </section>`;
}

function openPicker() {
  const pf = { q: '', group: '', kind: '' };
  const { box, close } = openSheet('');
  const paint = () => {
    const rows = filterExercises(listExercises(getDoc()), pf);
    box.querySelector('.pk-list').innerHTML = rows.length
      ? rows.map((e) => `<li><button type="button" class="btn" data-ex="${esc(e.id)}"><span style="text-align:left">${esc(e.name)}
          <small class="muted" style="display:block;font-weight:400">${esc(exerciseMeta(e))}</small></span></button></li>`).join('')
      : '<li><span class="muted">Nessun esercizio trovato.</span></li>';
  };
  const draw = (focus) => {
    box.innerHTML = `<h2>Aggiungi esercizio</h2>
      <div class="form pk-filters">${filterBar(pf)}</div>
      <button type="button" class="btn block" data-act="new">+ Nuovo esercizio</button>
      <ul class="rows pk-list"></ul>`;
    paint();
    bindFilterBar(box.querySelector('.pk-filters'), pf, (full) => (full ? draw(false) : paint()));
    if (focus) box.querySelector('.ex-search').focus();
  };
  draw(true);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ex) {
      close();
      addItem(b.dataset.ex);
    } else if (b.dataset.act === 'new') {
      close();
      openExerciseSheet({ name: pf.q.trim().slice(0, 40), onSaved: addItem });
    }
  };
}

function addItem(id) {
  if (!draft) return;
  draft.items.push(newItem(getDoc(), id));
  refresh();
  document.querySelector('[data-item]:last-of-type')?.scrollIntoView({ block: 'nearest' });
}

export function render(el, ctx) {
  const { doc, param } = ctx;
  refresh = ctx.refresh;
  const t = param === 'nuova' ? null : doc.templates.find((x) => x.id === param && !x.deleted);
  if (param !== 'nuova' && !t) {
    location.hash = '#schede';
    return;
  }
  if (!draft || draft.key !== param) draft = t ? fromTemplate(doc, t) : blank(doc);
  const d = draft;
  const ro = isReadOnly();

  el.innerHTML = `
    <header class="top"><a class="back" href="#schede">‹ Schede</a></header>
    <h1 style="margin-bottom:16px">${t ? 'Modifica scheda' : 'Nuova scheda'}</h1>
    <div class="card form">
      <label class="field">Nome<input data-f="name" maxlength="40" value="${esc(d.name)}" placeholder="Es. Push" autocomplete="off"></label>
      <fieldset><legend>Emoji</legend>
        <div class="emoji-row">${EMOJIS.map((x) => `<button type="button" data-emoji="${x}" class="${x === d.emoji ? 'on' : ''}" aria-label="Usa ${x}">${x}</button>`).join('')}</div>
        <input data-f="emoji" maxlength="8" value="${esc(d.emoji)}" aria-label="Emoji personalizzata">
      </fieldset>
      <fieldset><legend>Colore</legend>
        <div class="swatches">${COLORS.map((c, i) => `<label class="pick"><input type="radio" name="color" data-f="color" value="${c}"
          ${c === d.color ? 'checked' : ''} aria-label="Colore ${i + 1}"><span style="--sw:${c}"></span></label>`).join('')}</div>
      </fieldset>
    </div>
    <h2 class="list-title">Esercizi</h2>
    ${d.items.map((it, i) => itemCard(doc, d, it, i)).join('')}
    <button type="button" class="btn block" data-act="add" style="margin-bottom:12px">+ Aggiungi esercizio</button>
    <div class="card form">
      <div class="errors" role="alert"></div>
      ${ro ? '<p class="error">Modalità sola lettura: impossibile salvare.</p>' : ''}
      <button type="button" class="btn primary block" data-act="save">Salva</button>
      ${t ? `<div class="danger-zone">
        <button type="button" class="btn" data-act="dup" ${ro ? 'disabled' : ''}>Duplica</button>
        <button type="button" class="btn" data-act="archive" ${ro ? 'disabled' : ''}>${t.archived ? 'Ripristina' : 'Archivia'}</button>
        <button type="button" class="btn danger" data-act="delete" ${ro ? 'disabled' : ''}>Elimina</button></div>` : ''}
    </div>`;

  const save = el.querySelector('[data-act=save]');
  const errBox = el.querySelector('.errors');
  const status = () => {
    const msgs = validate(getDoc(), d);
    errBox.innerHTML = msgs.map((m) => `<p class="error">${esc(m)}</p>`).join('');
    save.disabled = ro || msgs.length > 0;
  };
  status();

  el.oninput = (e) => {
    const f = e.target.dataset;
    if (f.f) {
      if (f.f === 'color') { if (e.target.checked) d.color = e.target.value; } else {
        d[f.f] = e.target.value;
        if (f.f === 'emoji') el.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('on', b.dataset.emoji === d.emoji));
      }
    } else if (f.i !== undefined) {
      const it = d.items[+f.i];
      if (f.k === 'link') {
        it.link = e.target.checked;
        render(el, ctx);
        return;
      }
      if (f.s !== undefined) it.sets[+f.s][f.k] = e.target.value;
      else it[f.k] = e.target.value;
    }
    status();
  };

  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = +b.dataset.i;
    const it = d.items[i];
    const { act } = b.dataset;
    if (b.dataset.emoji) {
      d.emoji = b.dataset.emoji;
      el.querySelector('[data-f=emoji]').value = d.emoji;
      el.querySelectorAll('[data-emoji]').forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    if (act === 'add') { openPicker(); return; }
    if (act === 'addset' || act === 'addwarm') {
      const work = it.sets.filter((s) => !s.w);
      const src = { ...(work[work.length - 1] ?? it.sets[it.sets.length - 1] ?? {}) };
      if (act === 'addwarm') {
        src.w = true;
        src.kg = '';
        let at = 0;
        while (at < it.sets.length && it.sets[at].w) at++;
        it.sets.splice(at, 0, src);
      } else {
        src.w = false;
        it.sets.push(src);
      }
    } else if (act === 'delset') it.sets.splice(+b.dataset.s, 1);
    else if (act === 'del') {
      const prev = d.items[i - 1];
      if (prev) prev.link = prev.link && it.link;
      d.items.splice(i, 1);
    } else if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      [d.items[i], d.items[j]] = [d.items[j], d.items[i]];
      const lo = Math.min(i, j);
      [lo - 1, lo, lo + 1].forEach((k) => { if (d.items[k]) d.items[k].link = false; });   // moving breaks superset links
    } else if (act === 'save') {
      if (validate(getDoc(), d).length) return;
      const id = saveTemplate(buildFields(getDoc(), d));
      if (id == null) return;
      draft = null;
      location.hash = '#schede';
      return;
    } else if (act === 'dup') {
      const id = duplicateTemplate(t.id);
      if (id != null) location.hash = `#scheda/${encodeURIComponent(id)}`;
      return;
    } else if (act === 'archive') {
      archiveTemplate(t.id, !t.archived);
      draft = null;
      location.hash = '#schede';
      return;
    } else if (act === 'delete') {
      if (confirm(`Eliminare "${t.name}"? Le sessioni già svolte restano nello storico.`)) {
        deleteTemplate(t.id);
        draft = null;
        location.hash = '#schede';
      }
      return;
    } else return;
    render(el, ctx);
  };
}
