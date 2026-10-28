// Entry point: hash router, theme, banner, sync triggers, service worker.
import * as store from './store.js';
import { todayKey } from './logic.js';
import { initTooltips, hideTip } from './charts.js';
import * as today from './views/today.js';
import * as session from './views/session.js';
import * as calendar from './views/calendar.js';
import * as templates from './views/templates.js';
import * as schedaEdit from './views/scheda-edit.js';
import * as dayEdit from './views/template-edit.js';
import * as exercises from './views/exercises.js';
import * as progress from './views/progress.js';
import * as exerciseDetail from './views/exercise-detail.js';
import * as body from './views/body.js';
import * as settings from './views/settings.js';

// #scheda/<id|nuova> is the scheda editor, #scheda/<id>/giorno/<tplId|nuovo> the day editor.
const scheda = {
  render(el, ctx) {
    const m = /^([^/]+)\/giorno\/([^/]+)$/.exec(ctx.param);
    if (m) dayEdit.render(el, { ...ctx, schedaId: m[1], param: m[2] });
    else schedaEdit.render(el, ctx);
  },
};
const views = {
  oggi: today, sessione: session, calendario: calendar, schede: templates, scheda,
  esercizi: exercises, progressi: progress, esercizio: exerciseDetail, corpo: body, impostazioni: settings,
};
const TAB_OF = {                                                    // screens without their own tab
  sessione: 'oggi', scheda: 'schede', esercizi: 'schede', esercizio: 'progressi', corpo: 'progressi',
};
const main = document.getElementById('view');
const banner = document.getElementById('banner');
let shown = '';
let shownDay = '';

function route() {
  const [name, ...rest] = location.hash.slice(1).split('/');
  let param = '';
  try {
    param = rest.map(decodeURIComponent).join('/');      // hash split first, then each segment decoded on its own
  } catch { /* malformed escape: no parameter */ }
  if (name === 'programma') {                 // removed screen: old links go to the schede
    location.replace('#schede');
    return { name: 'schede', param: '' };
  }
  return { name: views[name] ? name : 'oggi', param };
}

function updateBanner() {
  const notice = store.getNotice();
  banner.hidden = !notice;
  banner.querySelector('span').textContent = notice;
}

function render() {
  const doc = store.getDoc();
  const { name, param } = route();
  const root = document.documentElement;
  if (doc.settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = doc.settings.theme;

  updateBanner();

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.view === (TAB_OF[name] || name);
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  hideTip();
  main.onclick = main.onchange = main.oninput = null;   // views re-attach their own
  shownDay = todayKey();
  views[name].render(main, { doc, param, today: shownDay, refresh: render });

  const key = `${name}/${param}`;
  if (key !== shown) {
    window.scrollTo(0, 0);
    shown = key;
  }
}

store.load();
store.onChange((e) => {
  // The live session redraws only the row that changed (keeps input focus).
  const { name, param } = route();
  if (e.detail?.kind === 'session' && name === 'sessione' && param === e.detail.id) return;
  render();
});
// Sync status only redraws the screen that shows it, so background syncs never reset an open form.
store.onSync(() => {
  updateBanner();
  if (route().name === 'impostazioni') render();
});
initTooltips();
banner.querySelector('button').onclick = store.clearNotice;
addEventListener('hashchange', render);
addEventListener('online', () => store.runSync());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    store.flushSync();                              // upload before iOS suspends the app
    return;
  }
  if (todayKey() !== shownDay && route().name !== 'sessione') render();   // after midnight (not on every switch: keeps open forms)
  store.runSync();
});
render();
store.runSync();

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
