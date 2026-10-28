// "Progressi": one period selector drives the charts; consistency, volume, sets per group, body map, records, cardio.
import { adherence, weekStreaks, addDays, weekStart, doneCount } from '../logic.js';
import { heatmap, valueLine, barChart, stackedBars } from '../charts.js';
import { bodyMap } from '../bodymap.js';
import { bodyMapLevel, pace } from '../metrics.js';
import { resolveExercise, GROUPS } from '../library.js';
import { esc, COLORS, GROUP_LABELS, fmtShort, fmtFull, pct, safeColor } from '../ui.js';
import {
  PERIODS, GROUP_COLORS, periodRange, shiftPeriod, bucketStats, cardioTotals, weekGroupSets, sessionNames, recordSummary, trainedIn,
} from './progress-data.js';

let period = 'settimana';
let anchor = null;                        // any day of the shown period; null = today
let mapWeek = null;                       // Monday of the body-map week; null = current week
const ACCENT = COLORS[0];
const MAX_CARDIO = 5;
const REST_KEY = '#altro';                 // reserved segment key: exercise ids never contain '#'
const MAX_RECORDS = 12;

const empty = (text) => `<p class="muted">${text}</p>`;
const bars = (points, unit, aria) => barChart(points, null, ACCENT, unit, aria);

function costanza(doc, r, today) {
  const a = adherence(doc, r.from, r.to, today);
  const st = weekStreaks(doc, today);
  const names = sessionNames(doc);
  const tip = (k, v) => `${fmtFull(k)} · ${v ? names[k].join(', ') : 'nessun allenamento'}`;
  return `<section class="card st-wide"><h2>Costanza</h2>
    <div class="tiles">
      <div class="card tile"><b>${a == null ? '—' : pct(a)}</b><small>allenamenti<br>previsti fatti</small></div>
      <div class="card tile"><b>${st.current}</b><small>serie attuale<br>(settimane)</small></div>
      <div class="card tile"><b>${st.best}</b><small>record<br>(settimane)</small></div>
    </div>
    <p class="chart-sub">Giorni con allenamento negli ultimi 12 mesi</p>
    ${heatmap((k) => (doneCount(doc, k) ? 1 : 0), ACCENT, today, tip)}
  </section>`;
}

function volume(stats) {
  const pts = stats.map((b) => ({ label: b.label, tip: b.tip, value: b.volume }));
  return `<section class="card"><h2>Volume</h2>
    ${pts.some((p) => p.value) ? bars(pts, 'kg', 'Volume totale per periodo in kg') : empty('Nessun carico registrato in questo periodo.')}
  </section>`;
}

function groupsCard(stats) {
  const used = GROUPS.filter((g) => stats.some((b) => b.groups[g]));
  if (!used.length) return `<section class="card"><h2>Serie per gruppo</h2>${empty('Nessuna serie registrata in questo periodo.')}</section>`;
  const keys = used.map((g) => GROUP_LABELS[g]);
  const colors = used.map((g) => GROUP_COLORS[GROUPS.indexOf(g)]);
  const series = stats.map((b) => ({
    label: b.label,
    values: Object.fromEntries(used.map((g) => [GROUP_LABELS[g], Math.round((b.groups[g] ?? 0) * 10) / 10])),
  }));
  const legend = keys.map((k, i) => `<span><i style="background:${safeColor(colors[i])}"></i>${esc(k)}</span>`).join('');
  return `<section class="card"><h2>Serie per gruppo</h2>
    ${stackedBars(series, keys, colors, { ariaLabel: 'Serie per gruppo muscolare per periodo', unit: 'serie' })}
    <div class="legend">${legend}</div></section>`;
}

function mapCard(doc, today) {
  const cur = weekStart(today);
  const wk = mapWeek && mapWeek < cur ? mapWeek : cur;
  const sets = weekGroupSets(doc, wk);
  const levels = Object.fromEntries(GROUPS.map((g) => [g, bodyMapLevel(sets[g] ?? 0)]));
  const title = wk === cur ? 'Questa settimana' : `${fmtShort(wk)} – ${fmtShort(addDays(wk, 6))}`;
  return `<section class="card"><h2>Mappa muscolare</h2>
    <div class="period-nav">
      <button class="icon-btn" data-act="prev" aria-label="Settimana precedente">‹</button>
      <b>${esc(title)}</b>
      <button class="icon-btn" data-act="next" aria-label="Settimana successiva" ${wk >= cur ? 'disabled' : ''}>›</button>
    </div>
    <div style="max-width:420px;margin:0 auto">${bodyMap(levels)}</div>
    <p class="chart-sub">Colore più intenso = più serie: meno di 5, 10, 15, da 15 in su.</p>
  </section>`;
}

function effort(stats) {
  const dur = stats.map((b) => ({ label: b.label, tip: b.tip, value: b.minutes ?? 0 }));
  const rpe = stats.map((b) => ({ label: b.label, tip: b.tip, value: b.rpe }));
  return `<section class="card"><h2>Durata e fatica</h2>
    ${dur.some((p) => p.value) ? `<p class="chart-sub">Durata media (minuti)</p>${bars(dur, 'min', 'Durata media degli allenamenti in minuti')}`
    : empty('Nessun allenamento concluso in questo periodo.')}
    ${rpe.some((p) => p.value != null) ? `<p class="chart-sub">RPE medio dell’allenamento</p>
      ${valueLine(rpe, ACCENT, 'RPE medio per periodo', { unit: 'RPE' })}` : ''}
  </section>`;
}

function cardio(doc, stats) {
  const top = cardioTotals(stats);
  if (!top.length) return `<section class="card"><h2>Cardio</h2>${empty('Nessuna attività cardio in questo periodo.')}</section>`;
  const shown = top.slice(0, MAX_CARDIO);
  const rest = top.slice(MAX_CARDIO);
  const nameOf = (id) => resolveExercise(doc, id)?.name ?? 'Esercizio';
  const keys = [...shown.map((t) => t.id), ...(rest.length ? [REST_KEY] : [])];
  const names = Object.fromEntries(keys.map((k) => [k, k === REST_KEY ? 'Altro' : nameOf(k)]));
  const colors = keys.map((_, i) => COLORS[i % COLORS.length]);
  const series = stats.map((b) => {
    const values = {};
    shown.forEach((t) => { values[t.id] = Math.round((b.cardio[t.id]?.km ?? 0) * 100) / 100; });
    if (rest.length) values[REST_KEY] = Math.round(rest.reduce((a, t) => a + (b.cardio[t.id]?.km ?? 0), 0) * 100) / 100;
    return { label: b.label, values };
  });
  const main = shown[0].id;
  const pts = stats.map((b) => {
    const c = b.cardio[main];
    const sec = c?.pkm ? c.psec / c.pkm : null;
    const mm = sec == null ? '' : ` · ${pace(c.psec, c.pkm)}/km`;
    return { label: b.label, tip: `${b.tip}${mm}`, value: sec == null ? null : Math.round(sec) };
  });
  const legend = keys.map((k, i) => `<span><i style="background:${safeColor(colors[i])}"></i>${esc(names[k])}</span>`).join('');
  return `<section class="card"><h2>Cardio</h2>
    <p class="chart-sub">Chilometri</p>
    ${stackedBars(series, keys, colors, { ariaLabel: 'Chilometri per periodo e attività', unit: 'km', names })}
    <div class="legend">${legend}</div>
    ${pts.some((p) => p.value != null) ? `<p class="chart-sub">Passo, ${esc(nameOf(main))} (secondi al km: più basso = più veloce)</p>
      ${valueLine(pts, COLORS[0], `Passo di ${nameOf(main)} in secondi al km`, { unit: 's/km' })}` : ''}
  </section>`;
}

function recordsCard(doc, r, today) {
  const all = trainedIn(doc, r.from, r.to < today ? r.to : today).map(({ id, last }) => ({ id, last, text: recordSummary(doc, id) }))
    .filter((x) => x.text && resolveExercise(doc, x.id));
  const list = all.slice(0, MAX_RECORDS);
  if (!list.length) return `<section class="card st-wide pr-list"><h2>Record personali</h2>${empty('Nessun record in questo periodo.')}</section>`;
  const rows = list.map((x) => `<li><a class="row" href="#esercizio/${encodeURIComponent(x.id)}">
    <span style="flex:1"><b>${esc(resolveExercise(doc, x.id).name)}</b><small class="muted">${esc(x.text)}</small></span>
    <span class="stat-meta">${esc(fmtFull(x.last))}</span></a></li>`).join('');
  return `<section class="st-wide pr-list"><h2 class="list-title">Record personali</h2><ul class="card list rows">${rows}</ul>
    ${all.length > list.length ? `<p class="chart-sub">Mostrati ${list.length} di ${all.length}</p>` : ''}</section>`;
}

export function render(el, { doc, today, refresh }) {
  const at = anchor && anchor <= today ? anchor : today;
  const r = periodRange(period, at);
  const stats = bucketStats(doc, r.buckets, today);
  const canNext = periodRange(period, shiftPeriod(period, at, 1)).from <= today;
  const seg = PERIODS.map(([v, label]) => `<label class="pick"><input type="radio" name="period" value="${v}"
    ${period === v ? 'checked' : ''}><span>${label}</span></label>`).join('');
  const any = doc.sessions.some((s) => s.end != null && !s.deleted);

  el.innerHTML = `
    <header class="top"><h1 class="grow">Progressi</h1><a class="btn small" href="#corpo">Corpo</a></header>
    <div class="seg period-seg">${seg}</div>
    <div class="period-nav">
      <button class="icon-btn" data-act="pprev" aria-label="Periodo precedente">‹</button>
      <b>${esc(r.title)}</b>
      <button class="icon-btn" data-act="pnext" aria-label="Periodo successivo" ${canNext ? '' : 'disabled'}>›</button>
    </div>
    ${any ? `<div class="stats-grid">
      ${costanza(doc, r, today)}
      ${volume(stats)}
      ${groupsCard(stats)}
      ${mapCard(doc, today)}
      ${effort(stats)}
      ${cardio(doc, stats)}
      ${recordsCard(doc, r, today)}
    </div>` : `<div class="card empty"><p class="muted">Concludi il primo allenamento per vedere i progressi.</p>
      <a class="btn primary" href="#oggi">Vai a Oggi</a></div>`}`;

  el.onchange = (e) => {
    if (e.target.name !== 'period') return;
    period = e.target.value;
    anchor = null;
    refresh();
  };
  el.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'pprev' || act === 'pnext') {
      anchor = shiftPeriod(period, at, act === 'pprev' ? -1 : 1);
      refresh();
      return;
    }
    if (act !== 'prev' && act !== 'next') return;
    const cur = weekStart(today);
    const wk = mapWeek && mapWeek < cur ? mapWeek : cur;
    mapWeek = addDays(wk, act === 'prev' ? -7 : 7);
    if (mapWeek >= cur) mapWeek = null;
    refresh();
  };
  el.querySelectorAll('.heat-scroll').forEach((s) => { s.scrollLeft = s.scrollWidth; });
}
