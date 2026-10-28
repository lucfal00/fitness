# Fitness

Diario di allenamento personale, offline, per iPhone e PC. Nessun account: i dati restano sul dispositivo.

- **Pianifica e registra** allenamenti con pesi, corpo libero, cardio e sport. **Schede** riutilizzabili e **programmi**
  (settimana tipo con cicli da 1 a 8 settimane, a rotazione o liberi), più modifiche per singolo giorno dal calendario.
- **Allenamento live**: timer di recupero, riscaldamento, superserie, RPE e progressione suggerita.
- **Progressi**: record personali, grafici per settimana/mese/6 mesi/anno, mappa muscolare.
- **Corpo**: peso corporeo e misure.
- **Libreria esercizi**: circa 125 esercizi, che si possono rinominare o nascondere; puoi anche creare, modificare ed eliminare esercizi tuoi.
- **Impostazioni**: tema, passo dei kg, recupero, suono, sincronizzazione, esporta/importa backup.

## 1. Pubblicazione su GitHub Pages (una volta sola)

1. Crea un account gratuito su <https://github.com>.
2. Crea un nuovo repository **pubblico** chiamato `fitness` (senza README).
   Il codice sarà visibile, i tuoi dati no: restano sul dispositivo.
3. Da questa cartella:
   ```bash
   git remote add origin https://github.com/lucfal00/fitness.git
   git push -u origin main
   ```
   Al primo push Windows apre il login GitHub nel browser.
4. Su GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
5. Dopo 1–2 minuti l'app è su `https://lucfal00.github.io/fitness/`.

⚠️ Fitness e Habits stanno sulla stessa origine (`lucfal00.github.io`): su PC condividono lo spazio del browser, ma
ognuna usa chiavi e cache proprie. Prima di pubblicare Fitness aggiorna e pubblica Habits con la modifica al service
worker che cancella solo le cache `habits-*`, altrimenti le due app si svuotano le cache a vicenda.

## 2. Installazione

- **iPhone**: apri l'indirizzo in **Safari** → pulsante Condividi → **Aggiungi alla schermata Home**.
  Apri sempre l'app dall'icona sulla Home (ha uno spazio dati suo, separato da Safari).
- **PC**: apri l'indirizzo in **Chrome** o **Edge** → icona "Installa" nella barra degli indirizzi.

Dopo la prima apertura funziona anche senza internet.

## 3. Sincronizzazione automatica (facoltativa)

I dati vengono compressi e cifrati sul dispositivo (AES-256-GCM, chiave ricavata dalla tua password con PBKDF2) e
salvati nel file `fitness-sync.json` di un Gist segreto sul tuo account GitHub: GitHub vede solo testo illeggibile.

1. Crea un token: <https://github.com/settings/tokens/new?scopes=gist&description=Fitness%20sync>
   → lascia spuntato solo **gist** → scegli la scadenza → **Generate token** → copia il codice `ghp_…`.
   Puoi riusare lo stesso token di Habits (scope `gist`).
2. Nell'app: **Impostazioni → Sincronizzazione** → incolla il token, scegli una password (≥ 8 caratteri) → **Collega**.
3. Ripeti sull'altro dispositivo con **lo stesso token e la stessa password**: i dati vengono uniti.

Sincronizza all'apertura, al ritorno della rete e qualche secondo dopo ogni modifica.
Se il token scade, l'app continua a funzionare offline e mostra un avviso: crea un nuovo token, **Scollega** e **Collega**.
Se dimentichi la password la copia sul Gist non è recuperabile (i dati sui dispositivi restano).

## 4. Backup e passaggio manuale iPhone ↔ PC

- **Esporta backup** (Impostazioni): crea il file `fitness-backup-AAAA-MM-GG.json`. Su iPhone scegli "Salva in File" →
  iCloud Drive; su PC salva nella cartella OneDrive.
- **Importa backup** sull'altro dispositivo: i dati vengono **uniti**, vince la modifica più recente.
- **Promemoria:** se la sincronizzazione è spenta e non fai un backup da più di 7 giorni (o non ne hai mai fatto uno), la schermata Oggi mostra un avviso con il pulsante per esportarlo.
- ⚠️ Se elimini l'icona dalla Home su iPhone, iOS cancella anche i dati: esporta prima un backup.

## 5. Aggiornamenti

Dopo un push su GitHub la pagina arriva sempre dalla rete quando sei online, gli altri file si aggiornano in background:
chiudi e riapri l'app un paio di volte (GitHub Pages può impiegare fino a 10 minuti).
Se aggiungi nuovi file all'app, elencali in `FILES` dentro `sw.js` e incrementa `CACHE` (ora `fitness-v2`, poi `fitness-v3`…).

**Nuova icona:** i dispositivi la memorizzano per nome file, quindi un nuovo disegno va generato con un nome nuovo
(`scripts/make-icons.mjs`, poi `index.html`, `manifest.webmanifest`, `sw.js`). Sull'iPhone l'icona si aggiorna solo
eliminandola dalla Home e aggiungendola di nuovo da Safari; su PC disinstallando e reinstallando l'app.
Prima collega la sincronizzazione (o esporta un backup).

## 6. Costi e limiti

- **Costi:** nessuno. GitHub Pages e Gist sono gratuiti.
- **Token GitHub:** è una chiave d'accesso, non un credito che si consuma. Il limite è 5.000 richieste/ora; l'app ne usa 2–3 per sincronizzazione.
- **Dati:** stanno sui dispositivi. Eliminare l'app o i dati del browser li cancella, salvo sincronizzazione o backup.
- **Notifiche:** non ci sono. In futuro si potrà riusare il servizio di notifiche di Habits.
- **Suono di fine recupero:** suona solo con l'app aperta. Su iPhone le web app non possono far vibrare il telefono.
- **Dipendenza da GitHub:** se un giorno cambiasse le condizioni gratuite, l'app installata continua a funzionare offline
  e i file si possono pubblicare altrove (Netlify, Cloudflare Pages): sono file statici.

## 7. Sviluppo

Serve solo Node.js (nessuna dipendenza da installare).

```bash
npm test
```

```bash
npm run serve
```

Il secondo comando avvia un server locale su <http://localhost:8081>. `npm run icons` rigenera le icone PNG.

Struttura: `js/logic.js` (calcoli puri, testati), `js/metrics.js` (metriche e record), `js/merge.js` (unione dati),
`js/library.js` (libreria esercizi), `js/store.js` (salvataggio e backup), `js/sync.js` e `js/crypto.js`
(sincronizzazione cifrata), `js/charts.js` (grafici SVG), `js/bodymap.js` (mappa muscolare), `js/timer.js`
(recupero), `js/views/` (una schermata per file), `sw.js` (offline). Specifica: `docs/superpowers/specs/`.
