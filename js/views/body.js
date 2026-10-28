// "Corpo" (#corpo): body weight with 7-day moving average, six measures, entry / edit by date.
import { setBody, isReadOnly } from '../store.js';
import { valueLine } from '../charts.js';
import { esc, COLORS, fmtKg, fmtFull, fmtShort, parseNum } from '../ui.js';
import { MEASURES, bodyEntries, movingAverage, dated } from './progress-data.js';

const SHOWN = 30;                         // points per chart / rows before "Mostra tutte"
let date = null;                          // day in the form; null = today
let msg = null;                           // { text, err } shown once
let all = false;

const field = (name, label, unit, value, ro) => `<label class="field">${label} (${unit})
  <input type="text" inputmode="decimal" name="${name}" value="${value != null ? esc(fmtKg(value)) : ''}" placeholder="–"
    autocomplete="off" ${ro ? 'disabled' : ''}></label>`;

function form(doc, day, today, ro) {
  const e = doc.body[day] ?? {};
  return `<section class="card"><h2>Inserimento</h2>
    <form class="form body-form" novalidate>
      <label class="field">Data<input type="date" name="date" value="${esc(day)}" max="${today}"></label>
      <div class="two">${field('kg', 'Peso', 'kg', e.kg, ro)}${MEASURES.map(([k, l]) => field(k, l, 'cm', e[k], ro)).join('')}</div>
      <p class="error" role="alert" ${msg?.err ? '' : 'hidden'}>${esc(msg?.err ? msg.text : '')}</p>
      ${msg && !msg.err ? `<p class="msg" role="status">${esc(msg.text)}</p>` : ''}
      <button class="btn primary block" type="submit" ${ro ? 'disabled' : ''}>Salva</button>
    </form></section>`;
}

function weightCard(entries) {
  const withKg = entries.filter((e) => e.kg != null);
  if (!withKg.length) return `<section class="card"><h2>Peso</h2><p class="muted">Nessun peso registrato.</p></section>`;
  const avg = movingAverage(withKg);
  const from = Math.max(0, withKg.length - SHOWN);
  const pts = dated(withKg.slice(from), (e) => e.kg, (e, full) => (full ? fmtFull(e.date) : fmtShort(e.date)));
  const over = avg.slice(from).map((a) => ({ value: a.value }));
  const last = withKg[withKg.length - 1];
  return `<section class="card"><h2>Peso</h2>
    <p class="chart-sub">Ultimo: <b>${fmtKg(last.kg)} kg</b> · media 7 giorni: <b>${fmtKg(avg[avg.length - 1].value)} kg</b></p>
    ${valueLine(pts, COLORS[0], 'Peso corporeo in kg con media mobile a 7 giorni', { unit: 'kg', overlay: over })}
    <div class="legend"><span><i style="background:${COLORS[0]}"></i>Peso</span><span>tratteggio: media 7 giorni</span></div></section>`;
}

function measureCards(entries) {
  return MEASURES.map(([k, label], i) => {
    const list = entries.filter((e) => e[k] != null).slice(-SHOWN);
    if (!list.length) return '';
    const pts = dated(list, (e) => e[k], (e, full) => (full ? fmtFull(e.date) : fmtShort(e.date)));
    return `<section class="card"><h2>${label}</h2>
      ${valueLine(pts, COLORS[(i + 1) % COLORS.length], `${label} in cm`, { unit: 'cm' })}</section>`;
  }).join('');
}

function entryList(entries, ro) {
  const list = [...entries].reverse();
  const shown = all ? list : list.slice(0, SHOWN);
  const rows = shown.map((e) => {
    const parts = [e.kg != null ? `${fmtKg(e.kg)} kg` : null,
      ...MEASURES.filter(([k]) => e[k] != null).map(([k, l]) => `${l.toLowerCase()} ${fmtKg(e[k])}`)].filter(Boolean);
    return `<li><span class="grow"><b>${fmtFull(e.date)}</b><small class="muted">${esc(parts.join(' · '))}</small></span>
      <span class="btn-row"><button class="btn small" data-act="edit" data-d="${e.date}">Modifica</button>
      <button class="btn small danger" data-act="del" data-d="${e.date}" ${ro ? 'disabled' : ''}>Elimina</button></span></li>`;
  }).join('');
  return `<section class="st-wide"><h2 class="list-title">Registrazioni</h2>
    <ul class="card list rows">${rows}</ul>
    ${list.length > SHOWN ? `<button class="btn block" data-act="more">${all ? 'Mostra meno' : `Mostra tutte (${list.length})`}</button>` : ''}</section>`;
}

export function render(el, { doc, today, refresh }) {
  const ro = isReadOnly();
  const day = date && date <= today ? date : today;
  const entries = bodyEntries(doc);
  const note = msg;
  el.innerHTML = `
    <header class="top"><a class="back" href="#progressi">‹ Progressi</a></header>
    <div class="top"><h1>Corpo</h1></div>
    ${form(doc, day, today, ro)}
    <div class="body-grid" style="margin-top:12px">
      ${weightCard(entries)}${measureCards(entries)}
      ${entries.length ? entryList(entries, ro) : ''}
    </div>`;
  if (note && !note.err) msg = null;

  const f = el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = f.elements.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) {
      msg = { text: 'Scegli una data valida (non nel futuro).', err: true };
      refresh();
      return;
    }
    const patch = {};
    for (const k of ['kg', ...MEASURES.map(([m]) => m)]) {
      const raw = f.elements[k].value.trim();
      if (!raw) { patch[k] = null; continue; }
      const v = parseNum(raw);
      if (!Number.isFinite(v) || v <= 0 || v > 500) {
        msg = { text: 'Inserisci solo numeri positivi (es. 78,4).', err: true };
        date = d;
        refresh();
        return;
      }
      patch[k] = Math.round(v * 10) / 10;
    }
    date = d;
    msg = { text: `Salvato (${fmtFull(d)}).` };
    setBody(d, patch);
  };
  f.elements.date.onchange = (e) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
    date = e.target.value;
    msg = null;
    refresh();
  };
  el.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    const act = b?.dataset.act;
    if (act === 'edit') {
      date = b.dataset.d;
      msg = null;
      refresh();
      window.scrollTo(0, 0);
    } else if (act === 'del') {
      if (!confirm(`Eliminare la registrazione del ${fmtFull(b.dataset.d)}?`)) return;
      const patch = Object.fromEntries(['kg', ...MEASURES.map(([m]) => m)].map((k) => [k, null]));
      setBody(b.dataset.d, patch);
    } else if (act === 'more') {
      all = !all;
      refresh();
    }
  };
}
