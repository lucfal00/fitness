// "Schede": list of schede (active first, then the others, concluded ones collapsed) + helpers shared by the views.
import { schedaDays, schedaGroups } from '../logic.js';
import { esc, safeColor, fmtFull } from '../ui.js';

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "N giorni · X volte a settimana". */
export const schedaMeta = (doc, p) => `${plural(schedaDays(doc, p).length, 'giorno', 'giorni')} · ${plural(p.perWeek, 'volta', 'volte')} a settimana`;

function row(doc, p, { on, today }) {
  const sched = p.from != null && p.from > today ? ` · Dal ${esc(fmtFull(p.from))}` : '';
  return `<li style="--c:${safeColor(p.color)}">
    <a class="row" href="#scheda/${encodeURIComponent(p.id)}">
      <span class="badge" aria-hidden="true">${esc(p.emoji || '💪')}</span>
      <span><b>${esc(p.name)}</b><small>${esc(schedaMeta(doc, p))}${sched}</small></span>
      ${on ? '<span class="pill">Attiva</span>' : ''}
    </a></li>`;
}

export function render(el, { doc, today }) {
  const { active, others, concluded } = schedaGroups(doc, today);
  const live = [...(active ? [[active, true]] : []), ...others.map((p) => [p, false])];

  el.innerHTML = `
    <header class="top"><div class="grow"><h1>Schede</h1></div>
      <a class="btn" href="#esercizi">Esercizi</a>
      <a class="btn primary" href="#scheda/nuova">+ Nuova</a></header>
    ${live.length
    ? `<ul class="card list rows">${live.map(([p, on]) => row(doc, p, { on, today })).join('')}</ul>`
    : `<div class="card empty"><p>Nessuna scheda ancora.</p>
        <p class="muted">Una scheda raccoglie i tuoi giorni di allenamento (Giorno 1, 2, 3…) e li propone a rotazione.</p>
        <a class="btn primary" href="#scheda/nuova">Crea la tua prima scheda</a></div>`}
    ${concluded.length ? `<details class="card"><summary>Storico (${concluded.length})</summary>
      <ul class="rows">${concluded.map((p) => row(doc, p, { on: false, today })).join('')}</ul></details>` : ''}`;
}
