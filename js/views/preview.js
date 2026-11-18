// "Anteprima": a day's exercises one at a time before starting, each with its figure, note and time; forward / back
// with the buttons, a swipe or the arrow keys. A circuit's exercises are shown once ("3 giri").
import { resolveExercise } from '../library.js';
import { isTimed, sideTag, PARTS } from '../interval.js';
import { figureOf, mountFigure } from '../figures.js';
import { esc } from '../ui.js';

const LABEL = { warm: 'Riscaldamento', main: 'Circuito', cool: 'Defaticamento' };

/** Steps of the preview: one per item, warm-up, circuit, cool-down for a timed day (in that order), as listed
 *  otherwise. { i, part, ex, note, line } where line says the time (or the sets) and the pause after. */
export function previewSteps(doc, t) {
  if (!t?.items?.length) return [];
  if (!isTimed(t)) {
    return t.items.map((it, i) => ({ i, part: null, ex: it.ex, note: it.note ?? '', line: setsLine(it) }));
  }
  const rounds = Math.max(1, Math.round(Number(t.rounds) || 1));
  const items = t.items.map((it, i) => ({ it, i })).filter(({ it }) => (it.sets?.[0]?.sec ?? 0) > 0);
  const out = [];
  for (const part of PARTS) {
    const list = items.filter(({ it }) => (it.part ?? 'main') === part);
    list.forEach(({ it, i }, k) => {
      const last = k === list.length - 1;
      let pause = Number(it.rest) || 0;
      if (part === 'main' && last) pause = rounds > 1 ? Number(t.roundRest) || 0 : 0;
      const after = part === 'main' && last && rounds > 1 ? `${pause} s tra un giro e l’altro`
        : pause ? `${pause} s di pausa` : 'senza pausa';
      out.push({ i, part, ex: it.ex, note: it.note ?? '', line: `${it.sets[0].sec} s · ${after}` });
    });
  }
  return out;
}

/** "3 serie · 10 rip · 40 kg" / "3 serie · 30 s" for a normal day. */
function setsLine(it) {
  const sets = (it.sets ?? []).filter((s) => !s.w);
  const s = sets[0] ?? {};
  const reps = Array.isArray(s.reps) ? s.reps[0] : s.reps;
  return [`${sets.length} ${sets.length === 1 ? 'serie' : 'serie'}`, s.sec ? `${s.sec} s` : '', reps ? `${reps} rip` : '',
    s.kg ? `${s.kg} kg` : ''].filter(Boolean).join(' · ');
}

/** Open the preview of day `t` over the page; returns close(). */
export function openPreview(doc, t) {
  const steps = previewSteps(doc, t);
  if (!steps.length) return () => {};
  const rounds = Math.max(1, Math.round(Number(t.rounds) || 1));
  const box = document.createElement('div');
  box.className = 'pv';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `Anteprima ${t.dayName ?? t.name ?? ''}`);
  box.innerHTML = `<div class="pv-bar"><b>Anteprima · ${esc(t.dayName ?? t.name ?? '')}</b>
      <button type="button" class="pv-x" data-pv="close" aria-label="Chiudi">✕</button></div>
    <div class="pv-prog" aria-hidden="true">${steps.map((s) => `<i class="${s.part ?? 'main'}"></i>`).join('')}</div>
    <div class="pv-slide">
      <span class="pv-part"></span>
      <h2 class="pv-name"></h2>
      <p class="pv-note"></p>
      <div class="pv-fig"></div>
      <p class="pv-time"></p>
    </div>
    <div class="pv-nav"><button type="button" class="btn" data-pv="prev">← Indietro</button>
      <span class="pv-count" aria-live="polite"></span>
      <button type="button" class="btn primary" data-pv="next">Avanti →</button></div>`;
  document.body.appendChild(box);
  document.body.classList.add('pv-open');
  const q = (s) => box.querySelector(s);
  const bars = [...box.querySelectorAll('.pv-prog i')];
  let n = 0;

  const show = () => {
    const s = steps[n];
    const ex = resolveExercise(doc, s.ex);
    const part = q('.pv-part');
    part.className = `pv-part ${s.part ?? ''}`;
    part.textContent = s.part ? (s.part === 'main' && rounds > 1 ? `${LABEL.main} · ${rounds} giri` : LABEL[s.part]) : '';
    const tag = sideTag(s.note);
    q('.pv-name').innerHTML = `${esc(ex?.name ?? 'Esercizio')}${tag ? ` <span class="tr-tag">${esc(tag)}</span>` : ''}`;
    q('.pv-note').textContent = s.note;
    const fig = q('.pv-fig');
    const f = figureOf(doc, s.ex, s.note);
    if (f) mountFigure(fig, f);
    else fig.innerHTML = '<p class="muted">Nessuna animazione per questo esercizio.</p>';
    q('.pv-time').textContent = s.line;
    q('.pv-count').textContent = `${n + 1} di ${steps.length}`;
    q('[data-pv=prev]').disabled = n === 0;
    q('[data-pv=next]').textContent = n === steps.length - 1 ? 'Fine' : 'Avanti →';
    bars.forEach((b, k) => b.classList.toggle('on', k <= n));
  };
  const close = () => {
    mountFigure(q('.pv-fig'), null);                     // stops its animation
    box.remove();
    document.body.classList.remove('pv-open');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
  };
  const go = (d) => {
    if (n + d >= steps.length) { close(); return; }
    n = Math.max(0, n + d);
    show();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Escape') close();
  };
  box.onclick = (e) => {
    const a = e.target.closest('[data-pv]')?.dataset.pv;
    if (a === 'close') close();
    else if (a === 'prev') go(-1);
    else if (a === 'next') go(1);
  };
  let x0 = null;
  let y0 = null;
  const slide = q('.pv-slide');
  slide.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  slide.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });
  slide.addEventListener('pointercancel', () => { x0 = null; });
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);          // leaving the screen closes it
  show();
  q('[data-pv=next]').focus();
  return close;
}
