// "Impostazioni": theme, kg step, rest, sound, sync and backup.
import {
  setSetting, exportBackup, importBackup, getSync, connectSync, disconnectSync, runSync, isReadOnly,
} from '../store.js';
import { esc, fmtKg } from '../ui.js';

export const APP_VERSION = '1.0.0';
const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Fitness%20sync';
const KG_STEPS = [0.5, 1, 1.25, 2.5, 5];
const REST_MIN = 15;
const REST_MAX = 600;

let msg = null;       // backup result { text, err }, survives the re-render triggered by the import
let syncMsg = null;   // connect result
let busy = false;     // connecting
let draft = { token: '', password: '' };   // kept in memory only, so re-renders do not wipe the form

const fmtDate = (ms) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtWhen = (ms) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const note = (m) => (m ? `<p class="msg${m.err ? ' err' : ''}" role="status">${esc(m.text)}</p>` : '');

function syncSection() {
  const s = getSync();
  if (!s.connected) {
    return `<section class="card settings"><h2>Sincronizzazione</h2>
      <p class="muted">Tiene allineati telefono e PC tramite un Gist segreto sul tuo account GitHub.
        I dati vengono cifrati con la tua password prima di lasciare il dispositivo.</p>
      <form class="form" data-form="sync" novalidate>
        <label class="field">Token GitHub
          <input name="token" type="password" value="${esc(draft.token)}" placeholder="ghp_…" autocomplete="off" spellcheck="false"></label>
        <small><a href="${TOKEN_URL}" target="_blank" rel="noopener">Crea un token</a> con il solo permesso <b>gist</b>.</small>
        <label class="field">Password di cifratura
          <input name="password" type="password" value="${esc(draft.password)}" autocomplete="new-password"></label>
        <small>Almeno 8 caratteri, la stessa su tutti i dispositivi. Se la dimentichi la copia sul cloud non è
          recuperabile; i dati sui dispositivi restano.</small>
        <button class="btn primary block" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Collego…' : 'Collega'}</button>
      </form>
      ${note(syncMsg)}
    </section>`;
  }
  const status = {
    idle: s.at ? `Sincronizzato · ${fmtWhen(s.at)}` : 'Collegato',
    syncing: 'Sincronizzazione…',
    offline: s.message,
    error: s.message,
  }[s.state] || 'Collegato';
  return `<section class="card settings"><h2>Sincronizzazione</h2>
    <p>Stato: <b class="${s.state === 'error' ? 'err-text' : ''}">${esc(status)}</b></p>
    <div class="btn-row">
      <button class="btn primary" data-act="sync-now" ${s.state === 'syncing' ? 'disabled' : ''}>Sincronizza ora</button>
      <button class="btn danger" data-act="sync-off">Scollega</button>
    </div>
    ${note(syncMsg)}
  </section>`;
}

function prefsSection(doc, ro) {
  const { theme, kgStep, rest, sound } = doc.settings;
  const opt = (v, label) => `<label class="pick"><input type="radio" name="theme" value="${v}" ${theme === v ? 'checked' : ''}><span>${label}</span></label>`;
  const steps = KG_STEPS.map((v) => `<option value="${v}" ${v === kgStep ? 'selected' : ''}>${fmtKg(v)} kg</option>`).join('');
  const odd = KG_STEPS.includes(kgStep) ? '' : `<option value="${esc(kgStep)}" selected>${esc(fmtKg(kgStep))} kg</option>`;
  return `<section class="card settings"><h2>Tema</h2>
      <div class="seg">${opt('auto', 'Automatico')}${opt('light', 'Chiaro')}${opt('dark', 'Scuro')}</div>
    </section>
    <section class="card settings"><h2>Allenamento</h2>
      <div class="form">
        <label class="field">Passo del carico (progressione)<select name="kgStep" ${ro ? 'disabled' : ''}>${odd}${steps}</select></label>
        <label class="field">Recupero predefinito (secondi, ${REST_MIN}–${REST_MAX})
          <input type="number" name="rest" inputmode="numeric" min="${REST_MIN}" max="${REST_MAX}" step="5" value="${esc(rest)}" ${ro ? 'disabled' : ''}></label>
        <label class="switch-row"><span>Suono a fine recupero</span>
          <span class="switch"><input type="checkbox" name="sound" ${sound ? 'checked' : ''} ${ro ? 'disabled' : ''}><span></span></span></label>
      </div>
    </section>`;
}

export function render(el, { doc, refresh }) {
  const last = doc.settings.lastBackup;

  el.innerHTML = `
    <header class="top"><h1>Impostazioni</h1></header>
    ${prefsSection(doc, isReadOnly())}
    ${syncSection()}
    <section class="card settings"><h2>Backup</h2>
      <p>Ultimo backup: <b>${last ? fmtDate(last) : 'mai'}</b></p>
      <p class="muted">Salva il file su iCloud Drive o OneDrive. Importandolo sull'altro dispositivo i dati vengono
        uniti: per ogni elemento vince la modifica più recente, niente viene sovrascritto per errore.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="export">Esporta backup</button>
        <button class="btn" data-act="import">Importa backup</button>
        <input class="sr-only" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true">
      </div>
      ${note(msg)}
    </section>
    <section class="card settings"><h2>Info</h2>
      <p class="muted">Fitness ${APP_VERSION} · funziona offline · i dati restano sui tuoi dispositivi (e cifrati sul tuo Gist, se colleghi la sincronizzazione).</p>
    </section>`;

  const input = el.querySelector('input[type="file"]');
  const form = el.querySelector('form[data-form="sync"]');

  if (form) {
    form.oninput = (e) => { draft[e.target.name] = e.target.value; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!draft.token.trim()) syncMsg = { text: 'Inserisci il token GitHub.', err: true };
      else if (draft.password.length < 8) syncMsg = { text: 'La password deve avere almeno 8 caratteri.', err: true };
      else {
        busy = true;
        syncMsg = null;
        refresh();
        try {
          await connectSync(draft.token, draft.password);
          draft = { token: '', password: '' };
          syncMsg = { text: 'Collegato: i dati di questo dispositivo sono sincronizzati.' };
        } catch (err) {
          syncMsg = { text: err.message || 'Collegamento non riuscito.', err: true };
        }
        busy = false;
      }
      refresh();
    };
  }

  el.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'import') input.click();
    if (act === 'sync-now') {
      syncMsg = null;
      runSync();
    }
    if (act === 'sync-off' && confirm('Scollegare la sincronizzazione su questo dispositivo? I dati restano qui e sul Gist.')) {
      syncMsg = null;
      disconnectSync();
    }
    if (act === 'export') {
      try {
        if (await exportBackup()) msg = { text: 'Backup esportato.' };
      } catch {
        msg = { text: 'Esportazione non riuscita.', err: true };
      }
      refresh();
    }
  };

  el.onchange = async (e) => {
    const name = e.target.name || '';
    if (name === 'theme') {
      setSetting('theme', e.target.value);
      return;
    }
    if (name === 'kgStep') {
      setSetting('kgStep', parseFloat(e.target.value));
      return;
    }
    if (name === 'sound') {
      setSetting('sound', e.target.checked);
      return;
    }
    if (name === 'rest') {
      const v = Math.round(parseFloat(e.target.value));
      if (Number.isFinite(v)) setSetting('rest', Math.min(REST_MAX, Math.max(REST_MIN, v)));
      refresh();                                  // shows the clamped value (or restores the old one)
      return;
    }
    if (e.target !== input || !input.files[0]) return;
    try {
      const r = await importBackup(input.files[0]);
      msg = { text: `Import completato: ${r.count} ${r.count === 1 ? 'elemento aggiornato' : 'elementi aggiornati'}.` };
    } catch (err) {
      msg = { text: err.message, err: true };
    }
    refresh();
  };
}
