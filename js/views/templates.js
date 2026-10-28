// "Schede": list of schede (active first, then the others, concluded ones collapsed) + helpers shared by the views.
import { activeProgram } from '../logic.js';
import { esc, safeColor, fmtFull } from '../ui.js';

/** A scheda is a rotation program with a weekly target (older week / free programs have no editing screen). */
export const isScheda = (p) => !!p && !p.deleted && p.kind === 'rotation' && p.perWeek > 0;

/** Live days (templates) of a scheda, in rotation order. */
export const schedaDays = (doc, p) => p.seq.map((id) => doc.templates.find((t) => t.id === id)).filter((t) => t && !t.deleted);

export const isConcludedScheda = (p, today) => p.from != null && p.to != null && p.to < today;

/** { active, others, concluded }: the running scheda (or null), the not concluded rest, the concluded ones (newest first). */
export function schedaGroups(doc, today) {
  const all = doc.programs.filter(isScheda);
  const cur = activeProgram(doc, today);
  const active = isScheda(cur) ? cur : null;
  const concluded = all.filter((p) => p !== active && isConcludedScheda(p, today)).sort((a, b) => b.to.localeCompare(a.to));
  const others = all.filter((p) => p !== active && !concluded.includes(p))
    .sort((a, b) => (a.from == null) - (b.from == null) || a.name.localeCompare(b.name, 'it'));
  return { active, others, concluded };
}

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
