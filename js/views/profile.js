// "Profilo" (#profilo): sex, birth year, height and typical day for the calorie estimate; the weight comes from Corpo.
import { setProfile, isReadOnly } from '../store.js';
import { LIFE, profileOf, bmr } from '../calories.js';
import { todayKey } from '../logic.js';
import { bodyWeightAt } from '../metrics.js';
import { esc, fmtKg, fmtKcal, fmtShort } from '../ui.js';
import { icon } from '../icons.js';

/** Basal of today and the typical day without sport, whole kcal as they add up elsewhere; null when data is missing. */
export function profileKcal(doc) {
  const today = todayKey();
  const p = profileOf(doc);
  const b = bmr(p, bodyWeightAt(doc, today), +today.slice(0, 4));
  if (b == null) return null;
  return { bmr: Math.round(b), day: Math.round(b) + Math.round(b * ((LIFE[p.life] ?? LIFE.sit).f - 1)) };
}

export function render(el, { doc, refresh }) {
  const p = profileOf(doc);
  const today = todayKey();
  const kg = bodyWeightAt(doc, today);
  const wDay = kg === undefined ? null : Object.keys(doc.body).filter((k) => k <= today && doc.body[k].kg != null).sort().pop();
  const k = profileKcal(doc);
  const dis = isReadOnly() ? 'disabled' : '';
  const sex = (v, label) => `<label class="pick"><input type="radio" name="sex" value="${v}" ${p.sex === v ? 'checked' : ''} ${dis}><span>${label}</span></label>`;
  const life = Object.entries(LIFE).map(([key, l]) => `<li><label class="prad"><input type="radio" name="life" value="${key}"
    ${(p.life ?? 'sit') === key ? 'checked' : ''} ${dis}><span class="grow">${l.name}<small>${l.hint}</small></span><small>×${fmtKg(l.f)}</small></label></li>`).join('');

  el.innerHTML = `
    <header class="top"><a class="back" href="#impostazioni">‹ Impostazioni</a></header>
    <div class="prof-head"><h1>Profilo</h1><p class="muted">Serve solo per stimare le calorie.</p></div>
    <div class="seg">${sex('m', 'Uomo')}${sex('f', 'Donna')}</div>
    <ul class="prows">
      <li><label for="born">Anno di nascita</label><input id="born" name="born" type="text" inputmode="numeric" maxlength="4"
        value="${esc(p.born ?? '')}" placeholder="es. 1999" autocomplete="off" enterkeyhint="done" ${dis}></li>
      <li><label for="cm">Altezza</label><input id="cm" name="cm" type="text" inputmode="numeric" maxlength="3"
        value="${esc(p.cm ?? '')}" placeholder="es. 178" autocomplete="off" enterkeyhint="done" ${dis}><span class="muted">cm</span></li>
      <li><a class="prow-link" href="#corpo"><span class="grow">Peso<small> · ${wDay ? `da Corpo, ${esc(fmtShort(wDay))}` : 'segnalo in Corpo'}</small></span>
        <span>${kg !== undefined ? `${esc(fmtKg(kg))} <span class="muted">kg</span>` : '–'}</span>${icon('chevron-right', 'ic chev')}</a></li>
    </ul>
    <h2 class="list-title">Giornata tipo, sport esclusi</h2>
    <ul class="prows">${life}</ul>
    ${k ? `<div class="kcal-pair prof-kcal"><div><small>Basale</small><b>${fmtKcal(k.bmr)}</b><small>kcal/giorno</small></div>
      <div><small>Senza sport</small><b>${fmtKcal(k.day)}</b><small>kcal/giorno</small></div></div>`
    : '<p class="muted prof-kcal">Completa i dati e segna il peso in Corpo per vedere il basale.</p>'}`;

  el.onchange = (e) => {
    const name = e.target.name || '';
    if (name === 'sex' || name === 'life') {
      setProfile({ [name]: e.target.value });
      return;
    }
    if (name !== 'born' && name !== 'cm') return;
    const t = e.target.value.trim();
    const v = Number(t);
    const ok = name === 'born' ? Number.isInteger(v) && v >= 1900 && v <= +today.slice(0, 4) : Number.isInteger(v) && v >= 80 && v <= 250;
    if (!t) setProfile({ [name]: null });
    else if (ok) setProfile({ [name]: v });
    refresh();                                    // basal updated, or the old value restored
  };
  el.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
  };
}
