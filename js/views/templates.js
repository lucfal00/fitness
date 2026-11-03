// "Schede": list of schede (in progress first, then the upcoming ones, concluded ones collapsed) + helpers shared by the views.
import { schedaDays, schedaGroups } from '../logic.js';
import { esc, safeColor, fmtFull } from '../ui.js';

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "dal 3 novembre 2026" / "dal … al …". */
export const periodText = (p) => (p.from == null ? '' : `dal ${fmtFull(p.from)}${p.to != null ? ` al ${fmtFull(p.to)}` : ''}`);

/** "N giorni · dal … al …". */
export const schedaMeta = (doc, p) => [plural(schedaDays(doc, p).length, 'giorno', 'giorni'), periodText(p)].filter(Boolean).join(' · ');

function row(doc, p, on) {
  return `<li style="--c:${safeColor(p.color)}">
    <a class="row" href="#scheda/${encodeURIComponent(p.id)}">
      <span class="badge" aria-hidden="true">${esc(p.emoji || '💪')}</span>
      <span><b>${esc(p.name)}</b><small>${esc(schedaMeta(doc, p))}</small></span>
      ${on ? '<span class="pill">In corso</span>' : ''}
    </a></li>`;
}

export function render(el, { doc, today }) {
  const { running, upcoming, concluded } = schedaGroups(doc, today);
  const live = [...running.map((p) => [p, true]), ...upcoming.map((p) => [p, false])];

  el.innerHTML = `
    <header class="top"><div class="grow"><h1>Schede</h1></div>
      <a class="btn" href="#esercizi">Esercizi</a>
      <a class="btn primary" href="#scheda/nuova">+ Nuova</a></header>
    ${live.length
    ? `<ul class="card list rows">${live.map(([p, on]) => row(doc, p, on)).join('')}</ul>`
    : `<div class="card empty"><p>Nessuna scheda ancora.</p>
        <p class="muted">Una scheda ha un periodo (inizio e fine) e i suoi giorni di allenamento (Giorno 1, 2, 3…).</p>
        <a class="btn primary" href="#scheda/nuova">Crea la tua prima scheda</a></div>`}
    ${concluded.length ? `<details class="card"><summary>Concluse (${concluded.length})</summary>
      <ul class="rows">${concluded.map((p) => row(doc, p, false)).join('')}</ul></details>` : ''}`;
}
