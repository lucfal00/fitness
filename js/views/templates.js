// "Schede": active list (reorderable) and archived section.
import { moveTemplate, archiveTemplate, isReadOnly } from '../store.js';
import { estimateMinutes } from '../metrics.js';
import { esc, safeColor } from '../ui.js';

function row(doc, t, i, n) {
  const mins = estimateMinutes(doc, t, doc.settings.rest);
  const count = t.items.length;
  const meta = `${count} ${count === 1 ? 'esercizio' : 'esercizi'}${mins > 0 ? ` · ~${mins} min` : ''}`;
  const side = n
    ? `<span class="order">
        <button data-act="up" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-act="down" aria-label="Sposta giù" ${i === n - 1 ? 'disabled' : ''}>↓</button>
      </span>`
    : '<button class="btn small" data-act="restore">Ripristina</button>';
  return `<li data-id="${esc(t.id)}">
    <a class="row" href="#scheda/${encodeURIComponent(t.id)}">
      <span class="badge" style="--c:${safeColor(t.color)}">${esc(t.emoji || '💪')}</span>
      <span><b>${esc(t.name)}</b><small>${meta}</small></span>
    </a>${side}
  </li>`;
}

export function render(el, { doc }) {
  const live = doc.templates.filter((t) => !t.deleted);
  const active = live.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
  const archived = live.filter((t) => t.archived).sort((a, b) => a.order - b.order);
  const ro = isReadOnly();

  el.innerHTML = `
    <header class="top"><div class="grow"><h1>Schede</h1></div>
      <a class="btn" href="#esercizi">Esercizi</a>
      <a class="btn primary" href="#scheda/nuova">+ Nuova</a></header>
    ${active.length
    ? `<ul class="card list rows">${active.map((t, i) => row(doc, t, i, active.length)).join('')}</ul>`
    : `<div class="card empty"><p class="muted">Nessuna scheda attiva.</p>
        <a class="btn primary" href="#scheda/nuova">Crea la prima scheda</a></div>`}
    ${archived.length ? `<details class="card"><summary>Archiviate (${archived.length})</summary>
      <ul class="rows">${archived.map((t) => row(doc, t, 0, 0)).join('')}</ul></details>` : ''}`;

  el.onclick = (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || ro) return;
    const id = b.closest('[data-id]').dataset.id;
    if (b.dataset.act === 'restore') archiveTemplate(id, false);
    else moveTemplate(id, b.dataset.act === 'up' ? -1 : 1);
  };
}
