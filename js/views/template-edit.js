// "Giorno" (#scheda/<id>/giorno/<tplId|nuovo>): day editor of a scheda, with validation. A day is "Normale" (items, sets,
// supersets) or "A tempo" (rounds, round rest, warm-up / circuit / cool-down items with duration and pause after).
import { resolveExercise, listExercises } from '../library.js';
import {
  getDoc, saveSchedaDay, addSchedaDay, nextDayName, isReadOnly,
} from '../store.js';
import { isScheda } from '../logic.js';
import { isTimed, PARTS, PART_LABELS, timerMinutes, sideTag } from '../interval.js';
import { esc, fmtKg, fmtDuration, parseNum } from '../ui.js';
import {
  openSheet, openExerciseSheet, filterBar, bindFilterBar, filterExercises, exerciseMeta,
} from './exercises.js';

// Unsaved form state lives here (not in the DOM), so store events that redraw the view never lose it.
let draft = null;
let refresh = () => {};
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (!location.hash.includes('/giorno/')) draft = null;
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
  const reps = s.reps?.[0];
  return { w, reps: reps != null ? String(reps) : '', kg: shape === 'reps' && s.kg != null ? fmtKg(s.kg) : '' };
}

function fromTemplate(doc, t, key) {
  if (isTimed(t)) {
    return {
      key, id: t.id, name: t.dayName ?? t.name, mode: 'timer', rounds: String(t.rounds ?? 1), roundRest: String(t.roundRest ?? 0),
      items: t.items.map((it) => ({
        ex: it.ex, part: it.part ?? 'main', sec: String(it.sets?.[0]?.sec ?? ''), rest: String(it.rest ?? 0), note: it.note ?? '',
      })),
    };
  }
  return {
    key, id: t.id, name: t.dayName ?? t.name, mode: 'normal', rounds: '3', roundRest: '60',
    items: t.items.map((it, i) => {
      const shape = shapeOf(doc, it.ex);
      return {
        ex: it.ex,
        link: it.group != null && t.items[i + 1]?.group === it.group,
        rest: it.rest != null ? String(it.rest) : isStrength(shape) ? String(doc.settings.rest) : '',
        note: it.note ?? '',
        sets: it.sets.map((s) => toRow(s, shape)),
      };
    }),
  };
}

const blank = (key, p) => ({
  key, id: null, name: nextDayName(p.id), items: [],      // same default as the store gives a day saved without a name
  mode: 'normal', rounds: '3', roundRest: '60',
});

function newItem(doc, ex) {
  const shape = shapeOf(doc, ex);
  const three = (row) => [0, 1, 2].map(() => ({ ...row }));
  const sets = {
    reps: three({ w: false, reps: '10', kg: '' }),
    repsBody: three({ w: false, reps: '10', kg: '' }),
    time: three({ w: false, sec: '30' }),
    cardio: [{ km: '', dur: '' }],
    sport: [{ dur: '' }],
  }[shape];
  return { ex, link: false, rest: isStrength(shape) ? String(doc.settings.rest) : '', note: '', sets };
}

const TIMED_DEFAULTS = { warm: ['60', '0'], main: ['40', '20'], cool: ['60', '0'] };

/** Draft item of a timed day. */
function timedItem(ex, part, note = '') {
  const [sec, rest] = TIMED_DEFAULTS[part];
  return { ex, part, sec, rest, note };
}

/** Switch the draft between normal and timed, keeping the exercises (with default values) and their notes. */
function switchMode(doc, d, mode) {
  if (d.mode === mode) return;
  d.items = d.items.map((it) => (mode === 'timer' ? timedItem(it.ex, 'main', it.note) : { ...newItem(doc, it.ex), note: it.note }));
  d.mode = mode;
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
  const reps = Number(r.reps);
  return {
    ...(r.w ? { w: true } : {}),
    reps: [reps, reps],                           // one target; stored as [n, n] like older min–max targets
    ...(shape === 'reps' && r.kg.trim() ? { kg: parseNum(r.kg) } : {}),
  };
}

/** Validation messages (Italian), empty when the draft can be saved. */
function validate(doc, d) {
  const out = [];
  const name = d.name.trim();
  if (!name) out.push('Inserisci il nome del giorno.');
  else if (name.length > 40) out.push('Il nome può avere al massimo 40 caratteri.');
  if (d.mode === 'timer') return out.concat(validateTimed(doc, d));
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
        } else if (!posInt(s.reps)) { msg = 'le ripetizioni devono essere maggiori di 0.'; break; }
        else if (s.kg.trim() && shape === 'reps' && !posNum(s.kg)) { msg = 'i kg devono essere maggiori di 0.'; break; }
      }
    }
    if (msg) out.push(`${label}: ${msg}`);
  });
  return out;
}

const isInt = (s) => INT.test(s.trim());

function validateTimed(doc, d) {
  const out = [];
  if (!posInt(d.rounds) || Number(d.rounds) > 99) out.push('I giri devono essere da 1 a 99.');
  if (!isInt(d.roundRest) || Number(d.roundRest) > 3600) out.push('La pausa tra i giri deve essere da 0 a 3600 secondi.');
  if (!d.items.some((it) => it.part === 'main')) out.push('Aggiungi almeno un esercizio al circuito.');
  d.items.forEach((it) => {
    const label = resolveExercise(doc, it.ex)?.name ?? 'Esercizio';
    if (!posInt(it.sec) || Number(it.sec) > 3600) out.push(`${label}: la durata deve essere da 1 a 3600 secondi.`);
    else if (!isInt(it.rest) || Number(it.rest) > 3600) out.push(`${label}: la pausa deve essere da 0 a 3600 secondi.`);
  });
  return out;
}

/** Fields of a timed day: items grouped warm-up, circuit, cool-down; circuit items get one set per round. */
function buildTimed(d) {
  const rounds = Number(d.rounds);
  const items = PARTS.flatMap((part) => d.items.filter((it) => it.part === part)).map((it) => ({
    ex: it.ex, group: null, part: it.part, note: it.note.trim(), rest: Number(it.rest),
    sets: Array.from({ length: it.part === 'main' ? rounds : 1 }, () => ({ sec: Number(it.sec) })),
  }));
  return { dayName: d.name.trim(), items, mode: 'timer', rounds, roundRest: Number(d.roundRest) };
}

/** Day fields the form edits: name, type and exercises (the look comes from the scheda). */
function buildFields(doc, d) {
  if (d.mode === 'timer') return buildTimed(d);
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
  return { dayName: d.name.trim(), items, mode: 'normal' };
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
      : `${input(`${at('reps')} inputmode="numeric" aria-label="Ripetizioni"`, s.reps, 'placeholder="rip."')}
         ${shape === 'reps' ? input(`${at('kg')} inputmode="decimal" aria-label="Chilogrammi (facoltativi)"`, s.kg, 'placeholder="kg"') : ''}`;
    return `<div class="tset n${shape === 'reps' ? 2 : 1}">${lbl}${fields}
      <button type="button" class="icon-btn small" data-act="delset" data-i="${i}" data-s="${j}" aria-label="Rimuovi serie ${j + 1}">✕</button></div>`;
  }).join('');
  const cap = shape === 'time' ? 'Secondi per serie'
    : shape === 'reps' ? 'Ripetizioni e kg (kg facoltativi)' : 'Ripetizioni';
  return `<small class="muted">${cap}</small>${rows}
    <div class="btn-row"><button type="button" class="btn small" data-act="addset" data-i="${i}">+ Serie</button>
      <button type="button" class="btn small" data-act="addwarm" data-i="${i}">+ Riscaldamento</button></div>`;
}

/** One-line summary of an exercise of a normal day: "3 × 10 · 60 kg · rec. 90 s · superserie". */
function itemSummary(doc, d, it, i) {
  const shape = shapeOf(doc, it.ex);
  const parts = [];
  if (shape === 'cardio') {
    const r = it.sets[0] ?? {};
    parts.push([r.km?.trim() ? `${r.km} km` : '', r.dur?.trim() ? r.dur : ''].filter(Boolean).join(' · ') || 'Cardio');
  } else if (shape === 'sport') {
    parts.push(it.sets[0]?.dur?.trim() || 'Sport');
  } else {
    const work = it.sets.filter((r) => !r.w);
    const warm = it.sets.length - work.length;
    const vals = [...new Set(work.map((r) => (shape === 'time' ? r.sec : r.reps)))];
    const unit = shape === 'time' ? ' s' : '';
    parts.push(vals.length === 1 ? `${work.length} × ${vals[0]}${unit}` : `${work.length} serie (${work.map((r) => (shape === 'time' ? r.sec : r.reps)).join(', ')})`);
    const kgs = [...new Set(work.map((r) => r.kg?.trim()).filter(Boolean))];
    if (kgs.length) parts.push(`${kgs.join('/')} kg`);
    if (warm) parts.push(`+${warm} risc.`);
    if (it.rest.trim()) parts.push(`rec. ${it.rest} s`);
  }
  const linked = (it.link && canLink(doc, d.items, i)) || (i > 0 && d.items[i - 1].link && canLink(doc, d.items, i - 1));
  if (linked) parts.push('superserie');
  return { text: parts.join(' · '), linked };
}

/** Collapsed exercise: name, note and summary on one tappable row. */
function itemRow(doc, d, it, i) {
  const ex = resolveExercise(doc, it.ex);
  const { text, linked } = itemSummary(doc, d, it, i);
  return `<section class="card tpl-ex tsum ${linked ? 'grouped' : ''}" data-item="${i}">
    <button type="button" class="tsum-row" data-act="open" data-i="${i}" aria-expanded="false">
      <span class="tname"><b>${esc(ex?.name ?? 'Esercizio rimosso')}</b><small>${esc([text, it.note].filter(Boolean).join(' · '))}</small></span>
      <span class="chev" aria-hidden="true">›</span></button>
  </section>`;
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
    ${isStrength(shape) ? `<label class="field">Recupero tra le serie (secondi)${input(`data-i="${i}" data-k="rest" inputmode="numeric"`, it.rest, `placeholder="${doc.settings.rest}"`)}</label>` : ''}
    <label class="field">Nota${input(`data-i="${i}" data-k="note" maxlength="120"`, it.note, 'autocomplete="off"')}</label>
    ${canLink(doc, d.items, i) ? `<label class="switch-row"><span>Unisci al successivo (superserie)</span>
      <span class="switch"><input type="checkbox" data-i="${i}" data-k="link" ${it.link ? 'checked' : ''}><span></span></span></label>` : ''}
    <button type="button" class="btn block small" data-act="close" data-i="${i}">Fatto</button>
  </section>`;
}

/** One compact row of a timed day: name and note, work and pause seconds, a menu (move, note, remove). */
function timedRow(doc, it, i) {
  const ex = resolveExercise(doc, it.ex);
  return `<li class="trow" data-item="${i}">
    <span class="tname"><b>${esc(ex?.name ?? 'Esercizio rimosso')}${sideTag(it.note) ? ` <span class="tr-tag">${esc(sideTag(it.note))}</span>` : ''}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}</span>
    ${input(`data-i="${i}" data-k="sec" inputmode="numeric" aria-label="Lavoro in secondi, ${esc(ex?.name ?? '')}"`, it.sec)}
    ${input(`data-i="${i}" data-k="rest" inputmode="numeric" aria-label="Pausa dopo in secondi, ${esc(ex?.name ?? '')}"`, it.rest)}
    <button type="button" class="icon-btn small" data-act="more" data-i="${i}" aria-label="Opzioni ${esc(ex?.name ?? 'esercizio')}">⋯</button>
  </li>`;
}

/** Menu of a timed row: move up / down within its part, edit the note, remove. */
function openRowMenu(doc, d, i, redraw) {
  const it = d.items[i];
  const same = d.items.map((x, k) => (x.part === it.part ? k : -1)).filter((k) => k >= 0);
  const pos = same.indexOf(i);
  const name = resolveExercise(doc, it.ex)?.name ?? 'Esercizio';
  const { box, close } = openSheet(`<h2>${esc(name)}</h2>
    <form class="form" novalidate>
      <label class="field">Nota (lato, verso, consigli)<input name="note" maxlength="120" value="${esc(it.note)}" autocomplete="off"
        placeholder="Es. Gamba sinistra"></label>
      <button type="submit" class="btn primary center">Salva nota</button>
    </form>
    <div class="btn-row menu-moves"><button type="button" class="btn" data-m="up" ${pos === 0 ? 'disabled' : ''}>↑ Sposta su</button>
      <button type="button" class="btn" data-m="down" ${pos === same.length - 1 ? 'disabled' : ''}>↓ Sposta giù</button></div>
    <button type="button" class="btn danger center" data-m="del">Rimuovi</button>
    <button type="button" class="btn center" data-m="cancel">Annulla</button>`);
  const form = box.querySelector('form');
  form.onsubmit = (e) => {
    e.preventDefault();
    it.note = form.note.value.trim().slice(0, 120);
    close();
    redraw();
  };
  box.onclick = (e) => {
    const m = e.target.closest('button[data-m]')?.dataset.m;
    if (!m) return;
    close();
    if (m === 'up' || m === 'down') {
      const j = same[pos + (m === 'up' ? -1 : 1)];
      if (j !== undefined) [d.items[i], d.items[j]] = [d.items[j], d.items[i]];
    } else if (m === 'del') d.items.splice(i, 1);
    if (m !== 'cancel') redraw();
  };
}

/** Total minutes of the draft, counting only valid values. */
function draftMinutes(d) {
  const ok = (v, fallback) => (isInt(v) ? v : fallback);
  return timerMinutes(buildTimed({
    ...d, rounds: posInt(d.rounds) ? d.rounds : '1', roundRest: ok(d.roundRest, '0'),
    items: d.items.filter((it) => posInt(it.sec)).map((it) => ({ ...it, rest: ok(it.rest, '0') })),
  }));
}

/** Form body of a timed day: rounds and round rest, then the three parts. */
function timedBody(doc, d) {
  const mins = draftMinutes(d);
  return `<div class="card form">
      <div class="two">
        <label class="field">Giri del circuito${input('data-f="rounds" inputmode="numeric"', d.rounds)}</label>
        <label class="field">Pausa tra i giri (s)${input('data-f="roundRest" inputmode="numeric"', d.roundRest)}</label>
      </div>
      <small class="muted">Riscaldamento e defaticamento si fanno una volta; il circuito si ripete per i giri indicati.<span class="mins">${mins ? ` Durata totale: circa ${mins} min.` : ''}</span></small>
    </div>
    ${PARTS.map((part) => {
    const rows = d.items.map((it, i) => (it.part === part ? timedRow(doc, it, i) : '')).join('');
    return `<h2 class="list-title">${PART_LABELS[part]}</h2>
      <div class="card tlist part-${part}">
        ${rows ? `<ul class="trows"><li class="thead" aria-hidden="true"><span></span><span>Lavoro s</span><span>Pausa s</span><span></span></li>${rows}</ul>` : ''}
        <button type="button" class="btn block small" data-act="add" data-part="${part}">+ Aggiungi ${part === 'main' ? 'esercizio' : PART_LABELS[part].toLowerCase()}</button>
      </div>`;
  }).join('')}`;
}

let pickPart = 'main';

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
  draft.items.push(draft.mode === 'timer' ? timedItem(id, pickPart) : newItem(getDoc(), id));
  draft.open = draft.items.length - 1;            // a new exercise opens for editing
  refresh();
  document.querySelector('[data-item]:last-of-type')?.scrollIntoView({ block: 'nearest' });
}

export function render(el, ctx) {
  const { doc, param, schedaId } = ctx;
  refresh = ctx.refresh;
  const p = doc.programs.find((x) => x.id === schedaId && isScheda(x));      // legacy programs go back to the list
  if (!p) {
    location.hash = '#schede';
    return;
  }
  const back = `#scheda/${encodeURIComponent(p.id)}`;
  const t = param === 'nuovo' ? null : doc.templates.find((x) => x.id === param && !x.deleted && x.scheda === p.id);
  if (param !== 'nuovo' && !t) {
    location.hash = back;
    return;
  }
  const key = `${p.id}/${param}`;
  if (!draft || draft.key !== key) draft = t ? fromTemplate(doc, t, key) : blank(key, p);
  const d = draft;
  const ro = isReadOnly();

  el.innerHTML = `
    <header class="top"><a class="back" href="${back}">‹ ${esc(p.name)}</a></header>
    <h1 style="margin-bottom:16px">${t ? 'Modifica giorno' : 'Nuovo giorno'}</h1>
    <div class="card form">
      <label class="field">Nome del giorno<input data-f="name" maxlength="40" value="${esc(d.name)}" placeholder="Es. Giorno 1" autocomplete="off"></label>
      <fieldset><legend>Tipo</legend>
        <div class="btn-row mode-row">${[['normal', 'Normale'], ['timer', 'A tempo']].map(([m, l]) => `<button type="button" class="btn${d.mode === m ? ' primary' : ''}"
          data-act="mode" data-m="${m}" aria-pressed="${d.mode === m}">${l}</button>`).join('')}</div>
        <small class="muted">${d.mode === 'timer' ? 'Esercizi, pause e riscaldamento scorrono a tempo, con avvisi sonori.' : 'Serie, ripetizioni e kg.'}</small>
      </fieldset>
    </div>
    ${d.mode === 'timer' ? timedBody(doc, d) : `<h2 class="list-title">Esercizi</h2>
    ${d.items.map((it, i) => (i === d.open ? itemCard(doc, d, it, i) : itemRow(doc, d, it, i))).join('')}
    <button type="button" class="btn block" data-act="add" style="margin-bottom:12px">+ Aggiungi esercizio</button>`}
    <div class="card form">
      <div class="errors" role="alert"></div>
      ${ro ? '<p class="error">Modalità sola lettura: impossibile salvare.</p>' : ''}
      <button type="button" class="btn primary block" data-act="save">Salva</button>
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
    if (f.f) d[f.f] = e.target.value;
    else if (f.i !== undefined) {
      const it = d.items[+f.i];
      if (f.k === 'link') {
        it.link = e.target.checked;
        render(el, ctx);
        return;
      }
      if (f.s !== undefined) it.sets[+f.s][f.k] = e.target.value;
      else it[f.k] = e.target.value;
    }
    const mins = el.querySelector('.mins');
    if (mins && d.mode === 'timer') {
      const m = draftMinutes(d);
      mins.textContent = m ? ` Durata totale: circa ${m} min.` : '';
    }
    status();
  };

  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = +b.dataset.i;
    const it = d.items[i];
    const { act } = b.dataset;
    if (act === 'open' || act === 'close') {
      d.open = act === 'open' ? i : -1;           // one exercise open at a time; the others stay one line
      render(el, ctx);
      if (act === 'open') el.querySelector(`[data-item="${i}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (act === 'add') {
      pickPart = b.dataset.part ?? 'main';
      openPicker();
      return;
    }
    if (act === 'mode') {
      switchMode(getDoc(), d, b.dataset.m);
      render(el, ctx);
      return;
    }
    if (act === 'more') {
      openRowMenu(getDoc(), d, i, () => render(el, ctx));
      return;
    }
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
      d.open = -1;
    } else if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      [d.items[i], d.items[j]] = [d.items[j], d.items[i]];
      if (d.open === i) d.open = j;                // the open exercise moves with its card
      const lo = Math.min(i, j);
      [lo - 1, lo, lo + 1].forEach((k) => { if (d.items[k]) d.items[k].link = false; });   // moving breaks superset links
    } else if (act === 'save') {
      if (ro || validate(getDoc(), d).length) return;
      const fields = buildFields(getDoc(), d);
      if (t) saveSchedaDay(t.id, fields);
      else if (addSchedaDay(p.id, fields) == null) return;
      draft = null;
      location.hash = back;
      return;
    } else return;
    render(el, ctx);
  };
}
