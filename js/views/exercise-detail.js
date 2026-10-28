// "Dettaglio esercizio" (#esercizio/<id>): estimated 1RM, max load, volume, best load per reps, records, history.
import { resolveExercise } from '../library.js';
import { records, pace } from '../metrics.js';
import { valueLine, barChart } from '../charts.js';
import { esc, COLORS, GROUP_LABELS, fmtKg, fmtNum, fmtFull, fmtShort, fmtDuration } from '../ui.js';
import { exerciseSeries, recordSummary, dated } from './progress-data.js';

const KIND = { weight: 'Pesi', body: 'Corpo libero', cardio: 'Cardio', sport: 'Sport' };
const LAST = 20;                          // sessions shown in the charts
const ACCENT = COLORS[0];

const empty = (t) => `<p class="muted">${t}</p>`;

function lineCard(title, list, key, unit, aria, color = ACCENT) {
  const pts = dated(list, (s) => s[key], (s, full) => (full ? fmtFull(s.date) : fmtShort(s.date)));
  return `<section class="card"><h2>${title}</h2>
    ${pts.some((p) => p.value != null) ? valueLine(pts, color, aria, { unit }) : empty('Nessun dato.')}</section>`;
}

function barCard(title, list, key, unit, aria, scale = 1) {
  const pts = dated(list, (s) => s[key] * scale, (s, full) => (full ? fmtFull(s.date) : fmtShort(s.date)));
  return `<section class="card"><h2>${title}</h2>
    ${pts.some((p) => p.value > 0) ? barChart(pts, null, ACCENT, unit, aria) : empty('Nessun dato.')}</section>`;
}

function repTable(r) {
  const rows = Array.from({ length: 12 }, (_, i) => i + 1).map((n) => `<tr><th scope="row">${n} rip</th>
    <td>${r.repMax[n] == null ? '–' : `${fmtKg(r.repMax[n])} kg`}</td></tr>`).join('');
  return `<section class="card"><h2>Miglior carico per ripetizioni</h2>
    <table class="rep-table"><tbody>${rows}</tbody></table></section>`;
}

function chartCards(ex, list) {
  const last = list.slice(-LAST);
  if (ex.kind === 'weight') {
    return `${lineCard('Massimale stimato', last, 'e1rm', 'kg', 'Massimale stimato per sessione in kg')}
      ${lineCard('Carico massimo', last, 'maxKg', 'kg', 'Carico massimo per sessione in kg', COLORS[1])}
      ${barCard('Volume per sessione', last, 'volume', 'kg', 'Volume per sessione in kg')}`;
  }
  if (ex.kind === 'body') {
    const time = ex.measure === 'time';
    return `${lineCard(time ? 'Secondi massimi' : 'Ripetizioni massime', last, time ? 'maxSec' : 'maxReps', time ? 's' : 'rip',
      time ? 'Secondi massimi per sessione' : 'Ripetizioni massime per sessione')}
      ${!time && last.some((s) => s.volume) ? barCard('Volume per sessione', last, 'volume', 'kg', 'Volume per sessione in kg') : ''}`;
  }
  if (ex.kind === 'cardio') {
    const withPace = last.map((s) => ({ ...s, pace: s.pace == null ? null : Math.round(s.pace) }));
    return `${barCard('Distanza per sessione', last, 'km', 'km', 'Distanza per sessione in km')}
      <section class="card"><h2>Passo (secondi al km: più basso = più veloce)</h2>
      ${withPace.some((s) => s.pace != null) ? valueLine(dated(withPace, (s) => s.pace, (s, full) => (full
    ? `${fmtFull(s.date)}${s.pace == null ? '' : ` · ${pace(s.pace, 1)}/km`}` : fmtShort(s.date))), ACCENT, 'Passo per sessione in secondi al km', { unit: 's/km' }) : empty('Servono sessioni con almeno 1 km.')}</section>`;
  }
  return barCard('Durata per sessione', last, 'sec', 'min', 'Durata per sessione in minuti', 1 / 60);
}

export function render(el, { doc, param }) {
  const ex = resolveExercise(doc, param);
  if (!ex) {
    location.hash = '#progressi';
    return;
  }
  const list = exerciseSeries(doc, ex.id);
  const r = records(doc, ex.id);
  const meta = [KIND[ex.kind], ex.group ? GROUP_LABELS[ex.group] : null].filter(Boolean).join(' · ');
  const rows = [...list].reverse().map((s) => `<li><a class="row" href="#sessione/${encodeURIComponent(s.id)}">
    <span style="flex:1"><b>${fmtFull(s.date)}</b><small class="muted">${esc(s.text || '–')}</small></span>
    <span class="chev" aria-hidden="true">›</span></a></li>`).join('');
  const best = recordSummary(doc, ex.id);

  el.innerHTML = `
    <header class="top"><a class="back" href="#progressi">‹ Progressi</a></header>
    <div class="top"><div class="grow"><h1>${esc(ex.name)}</h1><small class="muted">${esc(meta)}</small></div></div>
    ${list.length ? `
      ${best ? `<section class="card"><h2>Record</h2><p>${esc(best)}</p>
        ${ex.kind === 'weight' && r.volume != null ? `<p class="muted">Volume record in una sessione: ${fmtNum(r.volume)} kg</p>` : ''}
        ${ex.kind === 'sport' && r.maxSec != null ? `<p class="muted">Sessione più lunga: ${fmtDuration(r.maxSec)}</p>` : ''}
      </section>` : ''}
      ${chartCards(ex, list)}
      ${ex.kind === 'weight' ? repTable(r) : ''}
      <h2 class="list-title">Storico (${list.length})</h2>
      <ul class="card list rows">${rows}</ul>`
    : `<div class="card empty"><p class="muted">Nessun allenamento concluso con questo esercizio.</p></div>`}`;
}
