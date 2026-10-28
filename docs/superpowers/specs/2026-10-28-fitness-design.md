# Fitness — Design

Data: 2026-10-28
Stato: approvato in brainstorming, in revisione utente

## 1. Obiettivo

App personale per pianificare e registrare allenamenti (pesi, corpo libero, cardio, sport) e vedere i progressi con grafici.
Stessa base tecnica e stessa famiglia visiva di Habits (`lucfal00/habits`).

## 2. Vincoli

- iPhone (Safari, "Aggiungi a Home") + PC (Chrome/Edge, "Installa app"). Offline dopo la prima apertura.
- Nessuna libreria esterna, nessun build step: HTML/CSS/JS (ES modules). Moduli comuni copiati da Habits e adattati.
- GitHub Pages: repository `lucfal00/fitness` → `https://lucfal00.github.io/fitness/`.
- Lingua UI: italiano. Settimana: lunedì–domenica. Unità: kg, cm, km.
- Sincronizzazione facoltativa cifrata su Gist, come Habits (stesso token GitHub utilizzabile).

## 3. Fuori ambito (v1)

- Notifiche (in futuro: riuso del servizio di notifiche di Habits).
- Collegamento automatico con Habits.
- Foto dei progressi, libbre, Apple Health, GPS per la corsa, condivisione schede.

## 4. Schermate

Tab bar in basso: **Oggi · Calendario · Schede · Progressi · Impostazioni**.
Hash router: `#oggi`, `#calendario`, `#schede`, `#progressi`, `#impostazioni`,
`#sessione/<id>`, `#scheda/<id>`, `#programma/<id>`, `#esercizio/<id>`, `#corpo`.

### 4.1 Oggi

- Data con frecce ← → (non oltre oggi) e pulsante per tornare a oggi, come Habits.
- Striscia della settimana (lun–dom): per ogni giorno allenamenti previsti (contorno) e fatti (pieno).
- Card per ogni allenamento previsto nel giorno (§6.2): nome scheda, emoji, colore, elenco esercizi, durata stimata (§6.9) → **Inizia**.
  Programma a rotazione senza giorni: card "Prossima: <scheda>".
- Nessun previsto: card "Riposo" con **Allenati comunque** → scelta di una scheda qualsiasi o allenamento libero (vuoto).
- Allenamenti in corso (`end: null`): card in cima con **Riprendi**.
- Allenamenti conclusi del giorno: riepilogo (durata, volume, record).
- Card peso del giorno: inserimento rapido del peso corporeo; link a `#corpo` per le misure.
- Giorni passati: **Aggiungi allenamento** (scheda o libero) con durata inserita a mano.
- Stato vuoto (nessuna scheda): invito a creare la prima scheda.
- Banner backup se ultimo export > 7 giorni, ci sono dati e il sync non è collegato.

### 4.2 Allenamento in corso (`#sessione/<id>`)

- Schermata intera: nome scheda, timer totale (da `start`), pulsante **Termina**.
- Schermo acceso con Screen Wake Lock dove disponibile (richiesto all'apertura e al ritorno in primo piano).
- Esercizi in ordine; superserie/circuiti raggruppati con etichette A1, A2, B1…
- Per ogni serie una riga:
  - valori dell'ultima sessione di quell'esercizio in grigio;
  - valori proposti già inseriti (progressione §6.8, con tag "↑ +2,5 kg" / "↑ +1 rip");
  - campi secondo il tipo: pesi `kg × rip`; corpo libero `rip` oppure `s`, zavorra kg facoltativa; cardio `km` + durata `mm:ss` con passo calcolato; sport durata + intensità 1–10;
  - pulsanti − / + (passo kg da impostazioni, rip 1, secondi 5) e tocco sul valore per inserimento diretto;
  - spunta = serie fatta → parte il recupero;
  - serie di riscaldamento marcate **R**;
  - RPE facoltativo 1–10 (tocco sulla riga → scelta).
- Aggiungi/togli serie; aggiungi/togli/sostituisci/riordina esercizi; nota per esercizio.
- **Recupero**: barra in basso con conto alla rovescia, −15 s / +15 s, Salta. Durata dall'esercizio della scheda (default impostazioni).
  In superserie parte solo dopo l'ultima serie del gruppo. Suono (Web Audio) alla fine se l'app è visibile e il suono è attivo;
  se l'app torna visibile a recupero finito mostra "Recupero finito". Il timer è un timestamp di fine, ricalcolato al ritorno in primo piano.
- Ogni modifica viene salvata subito: chiudendo l'app si riprende da dove si era.
- **Termina** → riepilogo: durata, volume, serie fatte, record battuti 🏆 (o "prima volta"), RPE dell'allenamento 1–10, nota → **Salva**.
  Se la sessione è nata da una scheda e la struttura è cambiata (esercizi o numero di serie): "Aggiornare la scheda con queste modifiche?".
- **Scarta allenamento** (con conferma) → soft delete.
- Un solo allenamento in corso avviato per dispositivo: avviandone un altro, l'app chiede di riprendere o terminare quello aperto.

### 4.3 Schede ed esercizi (`#schede`, `#scheda/<id>`)

- Lista schede attive (riordinabili con frecce su/giù) e sezione "Archiviate".
- Form crea/modifica scheda:
  - nome (obbligatorio, max 40 caratteri), emoji, colore (palette di 8);
  - esercizi in ordine; per ognuno: serie (numero, ripetizioni fisse o intervallo `min–max`, oppure secondi; kg iniziali facoltativi),
    serie di riscaldamento, recupero (s), "unisci al successivo" (superserie), nota;
  - cardio: distanza e/o durata obiettivo; sport: durata obiettivo.
- Azioni: duplica, archivia/ripristina, elimina (conferma; soft delete).
- **Esercizi** (dalla schermata Schede): libreria di ~100 esercizi in italiano con ricerca e filtri per gruppo muscolare e tipo.
  Esercizi della libreria: rinomina, nascondi. Esercizi propri: crea (nome, tipo, misura per corpo libero, gruppo principale, gruppi secondari), modifica, elimina (soft delete; lo storico resta leggibile).

### 4.4 Calendario e programmi (`#calendario`, `#programma/<id>`)

- Vista mese: per ogni giorno allenamenti previsti (contorno, colore scheda) e fatti (pieno); frecce mese precedente/successivo.
- Tocco su un giorno → foglio con le azioni:
  - **Sposta** un previsto a un'altra data; **Salta**; **Sostituisci** con un'altra scheda; **Aggiungi** una scheda (anche più allenamenti nello stesso giorno);
  - **Ripristina programma** (annulla le modifiche del giorno);
  - giorni passati: elenco degli allenamenti fatti (apre il dettaglio) e **Aggiungi allenamento**.
- Sezione Programmi: programma attivo (o programmato) in evidenza, programmi non attivati, storico (programmi conclusi con il loro periodo).
- Form programma:
  - nome; tipo: **Settimana tipo** | **Rotazione** | **Libero**;
  - Settimana tipo: numero di settimane del ciclo (1–8); per ogni settimana e giorno zero o più schede;
  - Rotazione: sequenza di schede (riordinabile, ripetizioni ammesse); giorni di allenamento facoltativi (lun…dom).
- **Attiva**: chiede data di inizio (default oggi) e fine facoltativa (§6.1). Riattivare un programma concluso ne crea una copia, così lo storico non cambia.
- **Termina ora**: `to` = ieri (o torna non attivato se non ancora iniziato).

### 4.5 Progressi (`#progressi`, `#esercizio/<id>`, `#corpo`)

- Selettore periodo: settimana / mese / 6 mesi / anno, con assi completi (come Habits).
- **Costanza**: % allenamenti previsti fatti (§6.4), serie di settimane attuale e record (§6.5), calendario annuale (giorni con allenamento).
- **Volume**: volume per settimana; serie per gruppo muscolare (barre impilate per settimana).
- **Mappa muscolare**: sagoma fronte/retro con 11 zone colorate per serie della settimana selezionata (§6.7).
- **Record personali**: elenco per esercizio dei record più recenti.
- **Durata e fatica**: durata media per allenamento, RPE medio per settimana sovrapposto al volume.
- **Cardio**: km per settimana per attività, andamento del passo.
- **Dettaglio esercizio** (`#esercizio/<id>`): massimale stimato nel tempo, carico massimo e volume per sessione,
  tabella miglior carico per 1–12 ripetizioni, record, storico sessioni. Corpo libero: ripetizioni/secondi massimi per sessione. Cardio: distanza e passo.
- **Corpo** (`#corpo`): peso con media mobile 7 giorni, misure (una linea per misura), inserimento/modifica per data.

### 4.6 Impostazioni

- Tema: automatico / chiaro / scuro.
- Passo kg (default 2,5), recupero predefinito (default 90 s), suono del recupero (on/off).
- Sincronizzazione (come Habits, §7). Esporta / Importa backup. Data ultimo backup, versione app.

## 5. Modello dati

Un unico documento JSON in `localStorage` (chiave `fitness.v1`):

```json
{
  "version": 1,
  "exercises": [{ "id": "x_8fk2la", "name": "Hip thrust", "kind": "weight", "measure": "reps",
    "group": "glutei", "also": ["femorali"], "deleted": false, "updatedAt": 1798364400000 }],
  "exerciseEdits": { "lib_panca_piana": { "name": "Panca", "hidden": false, "t": 1798364400000 } },
  "templates": [{ "id": "t_k3j9x2", "name": "Push", "emoji": "💪", "color": "#2f8f4a",
    "order": 0, "archived": false, "deleted": false, "updatedAt": 1798364400000,
    "items": [{ "ex": "lib_panca_piana", "group": "g1", "rest": 90, "note": "",
      "sets": [{ "w": true, "reps": [10, 10], "kg": 40 }, { "reps": [8, 10], "kg": 60 }] }] }],
  "programs": [{ "id": "p_q8w2e1", "name": "PPL", "kind": "week",
    "from": "2026-11-02", "to": null, "deleted": false, "updatedAt": 1798364400000,
    "weeks": [[["t_k3j9x2"], [], ["t_b"], [], ["t_c", "t_run"], [], []]],
    "seq": [], "days": null }],
  "plan": { "2026-11-04": { "items": ["t_b"], "t": 1798364400000 } },
  "sessions": [{ "id": "s_m2n4b6", "date": "2026-10-28", "start": 1798364400000, "end": 1798368000000,
    "tpl": "t_k3j9x2", "rot": null, "rpe": 7, "note": "", "deleted": false, "updatedAt": 1798368000000,
    "items": [{ "ex": "lib_panca_piana", "group": null, "note": "",
      "sets": [{ "w": false, "kg": 62.5, "reps": 8, "sec": null, "km": null, "rpe": 8, "done": true }] }] }],
  "body": { "2026-10-28": { "kg": 78.4, "vita": 84, "t": 1798364400000 } },
  "settings": { "theme": "auto", "kgStep": 2.5, "rest": 90, "sound": true, "lastBackup": 0 }
}
```

- **id**: prefisso + 6 caratteri base36 casuali (`x_` esercizio, `t_` scheda, `p_` programma, `s_` sessione, `g` + n per gruppi di superserie).
- **Date** sempre locali `YYYY-MM-DD`, mai UTC. `t`/`updatedAt`/`start`/`end`: `Date.now()`.
- **exercises** (solo propri) e libreria `js/library.js` (id `lib_*`, stessi campi, non salvata nel documento):
  - `kind`: `weight` | `body` | `cardio` | `sport`;
  - `measure` (solo `body`): `reps` | `time`;
  - `group`: uno tra `petto`, `dorso`, `spalle`, `bicipiti`, `tricipiti`, `avambracci`, `addome`, `glutei`, `quadricipiti`, `femorali`, `polpacci`; `cardio`/`sport` senza gruppo (`null`);
  - `also`: gruppi secondari (array, anche vuoto).
- **exerciseEdits**: modifiche agli esercizi della libreria (`name`, `hidden`).
- **templates.items[].sets[]** (obiettivi): `w` riscaldamento (assente = false); `reps: [min, max]` (min = max: fisse) oppure `sec`; `kg` facoltativo; cardio `km` e/o `sec`; sport `sec`.
  Item consecutivi con lo stesso `group` non nullo formano una superserie. `rest` in secondi (assente = impostazioni).
- **programs**:
  - `kind`: `week` | `rotation` | `free`;
  - `weeks` (`week`): N = 1–8 settimane × 7 giorni (indice 0 = lunedì) × lista di id scheda;
  - `seq` (`rotation`): lista di id scheda; `days` (`rotation`): giorni di allenamento 1–7 (1 = lunedì) oppure `null`;
  - `from` = inizio dell'attivazione oppure `null` (programma non attivato); `to` = fine inclusa oppure `null`.
- **plan[data]**: `items` = lista che sostituisce i previsti del giorno (`[]` = saltato); `items: null` = nessuna modifica (ripristino; la chiave non si cancella, serve al merge).
- **sessions**:
  - `date` = data locale di `start`; `end: null` = in corso; `tpl` = scheda di origine o `null` (libero);
  - `rot: { p, i }` = passo `i` della rotazione del programma `p` completato da questa sessione (§6.3), altrimenti `null`;
  - set: `w`, `kg` (pesi; zavorra per corpo libero), `reps`, `sec`, `km`, `rpe` (1–10 o `null`; per sport = intensità), `done`;
  - sessione aggiunta a posteriori: `start` = giorno alle 12:00, `end` = `start` + durata inserita.
- **body[data]**: `kg` e misure facoltative in cm `vita`, `fianchi`, `petto`, `braccio`, `coscia`, `polpaccio`.
- Soft delete ovunque (`deleted: true`): gli oggetti restano per il merge e per lo storico.
- All'avvio: `navigator.storage.persist()`.
- Spazio stimato ~0,3 MB/anno (250 allenamenti); limite `localStorage` ~5 MB per origine, condiviso con Habits sul PC (§9).

## 6. Regole di calcolo (`logic.js`, `metrics.js`, funzioni pure)

Una sessione è **conclusa** se `end ≠ null` e `deleted = false`. `fatti(d)` = numero di sessioni concluse con `date = d`.

### 6.1 Programma attivo
Il programma non eliminato con `from ≠ null`, `from ≤ d` e (`to = null` o `d ≤ to`) e `from` più recente. Nessuno → nessun previsto da programma.
Attivando un programma con inizio `f`:
- ogni altro programma con `from < f` e (`to = null` o `to ≥ f`) riceve `to = f − 1`;
- ogni altro programma con `from ≥ f` torna non attivato (`from = null`, `to = null`).

### 6.2 Previsti del giorno `d`
- `plan[d].items ≠ null` → quella lista.
- Altrimenti secondo il programma attivo `P`:
  - `week`: settimana `k = ⌊(d − lunedì della settimana di P.from) / 7⌋ mod N`, giorno `g` = giorno della settimana di `d` → `P.weeks[k][g]`;
  - `rotation` con `days`: se il giorno della settimana di `d` ∈ `days` → esattamente un previsto. La scheda mostrata viene dalla proiezione (sotto) per i giorni `≥ oggi`; per i giorni passati conta solo il numero;
  - `rotation` senza `days`, `free`: nessun previsto.
- Schede eliminate o archiviate vengono ignorate (anche nella sequenza della rotazione).
- **Proiezione rotazione**: partendo dal prossimo indice `n0` (§6.3), si assegnano in ordine `seq[n0]`, `seq[n0+1]`, … (mod lunghezza) ai giorni di allenamento `≥ oggi` senza `plan[d].items ≠ null`.
  Se oggi esiste già una sessione conclusa con `rot.p = P.id`, la proiezione parte da domani (oggi resta un previsto, già fatto).
- In Oggi e nel calendario un previsto appare **fatto** se nello stesso giorno c'è una sessione conclusa della stessa scheda.

### 6.3 Rotazione
- Prossimo indice: `(i dell'ultima sessione conclusa con rot.p = P.id, per start) + 1) mod len(seq)`; nessuna → 0.
- Una sessione avviata con `tpl = seq[prossimo indice]` mentre `P` è attivo riceve `rot = { p: P.id, i: prossimo indice }` (anche se avviata dalla schermata Schede).
  Sessioni con altre schede o libere: `rot = null`, la rotazione non avanza.

### 6.4 Costanza
Per ogni giorno `d` del periodo, con `d ≤ oggi`:
- `prev(d)` = numero di previsti (§6.2); `ok(d) = min(prev(d), fatti(d))`;
- oggi: `prev(oggi)` è sostituito da `ok(oggi)` (oggi non fatto non è mancato).
- Costanza = `Σ ok / Σ prev`; `Σ prev = 0` → nessun valore ("—").
- Saltati e spostati non contano (non sono più previsti in quel giorno). Allenamenti extra non aumentano la %.

### 6.5 Serie di settimane
Settimana lun–dom; per ogni settimana `S = Σ prev`, `O = Σ ok` (stesse regole di §6.4, giorni futuri esclusi).
- Programma che pianifica (`week`, `rotation` con `days`) attivo in almeno un giorno della settimana:
  `S > 0` → completa se `O = S`; `S = 0` → settimana ignorata (né conta né interrompe).
- Altrimenti (`free`, `rotation` senza `days`, nessun programma): completa se ≥ 1 sessione conclusa.
- Settimana corrente: contata se completa, altrimenti ignorata.
- Serie attuale = settimane complete consecutive a ritroso; record = massima serie nello storico.

### 6.6 Volume
Solo set `done` e non `w`:
- `weight`: `kg × reps`;
- `body` con `measure = reps`: `(peso(d) + kg) × reps` se `peso(d)` noto, altrimenti nessun volume (contano solo le ripetizioni);
  `peso(d)` = `body[x].kg` con `x` massimo `≤ d`; `kg` assente = 0;
- `body` con `measure = time`, `cardio`, `sport`: nessun volume.

### 6.7 Serie per gruppo e mappa muscolare
- Per ogni set `done` e non `w` di esercizi `weight`/`body`: +1 al `group`, +0,5 a ogni gruppo in `also`.
- Mappa muscolare: livelli per zona `0` | `< 5` | `< 10` | `< 15` | `≥ 15` serie nella settimana selezionata.

### 6.8 Massimale, record, progressione
- **Massimale stimato** (Epley): carico `c` = `kg` (`weight`) o `peso(d) + kg` (`body`, se `peso(d)` noto);
  `reps = 1` → `c`; `2 ≤ reps ≤ 12` → `c × (1 + reps / 30)`; `reps > 12` → non calcolato.
- **Record** per esercizio, su set `done` non `w`:
  - `weight`: carico massimo, massimale stimato, volume della sessione, miglior carico per `r` = 1…12 (massimo `kg` tra i set con `reps ≥ r`);
  - `body` reps: ripetizioni massime in un set (e massimale stimato se calcolabile); `body` time: secondi massimi;
  - `cardio`: distanza massima; passo migliore tra le sessioni con `km ≥ 1`; `sport`: durata massima.
  - A fine allenamento si segnalano i record **superati in modo stretto** rispetto alle sessioni concluse precedenti (per `start`).
    Prima sessione con quell'esercizio → "prima volta", nessun record.
- **Progressione suggerita** (valori proposti in §4.2), dall'ultima sessione conclusa che contiene l'esercizio; set di lavoro = non `w`:
  - intervallo obiettivo: `reps` dell'item della scheda; senza scheda o senza intervallo → ripetizioni dell'ultima sessione come valore fisso;
  - `weight`: se tutti i set di lavoro sono `done` con `reps ≥ max` → `kg` = massimo `kg` dei set di lavoro + `kgStep`, `reps = min`;
    altrimenti stesso `kg` per set e `reps = min(max, reps ultima + 1)`;
  - `body` reps: `reps` ultima + 1 per set; `body` time: `sec` ultima + 5;
  - `cardio`, `sport`: valori dell'ultima sessione, nessun aumento;
  - nessuna sessione precedente → valori della scheda.

### 6.9 Passo e durata stimata
- Passo = `sec / km`, mostrato `mm:ss/km`.
- Durata stimata scheda = Σ set `weight`/`body` di (40 s + recupero, con recupero solo dopo l'ultimo item di una superserie e nessun recupero dopo l'ultimo set della scheda) + Σ `sec` obiettivo di cardio/sport; arrotondata ai 5 minuti.

## 7. Backup, sync e merge

- **Backup** come Habits: file `fitness-backup-AAAA-MM-GG.json`; iPhone `navigator.share({files})`, PC download; import con validazione, poi merge.
- **Sync** come Habits (`js/sync.js`, `js/crypto.js`), con queste differenze:
  - file del Gist `fitness-sync.json`, `app: "fitness"`; configurazione locale in `fitness.sync`;
  - il JSON è compresso con `CompressionStream('gzip')` prima di AES-GCM; busta con `"z": "gzip"`;
  - se la risposta `GET /gists/:id` ha `truncated: true` per il file, il contenuto si scarica da `raw_url` (senza header `Authorization`).
- **Merge** (vince il più recente):
  - `exercises`, `templates`, `programs`, `sessions` per `id`, confronto `updatedAt`;
  - `exerciseEdits`, `plan`, `body` per chiave, confronto `t`;
  - `settings` locali mantenute, `lastBackup` = max.
  - Stessa sessione modificata su due dispositivi: vince l'ultimo salvataggio (intera sessione).
- Esito mostrato: "N elementi aggiornati".

## 8. Architettura file

```
index.html              shell + tab bar
style.css               stile, token colore, tema chiaro/scuro
manifest.webmanifest    nome "Fitness", icone, display standalone, scope "./"
sw.js                   offline, cache "fitness-v3"
icons/                  fitness-v3-192.png, -512.png, -maskable-512.png, -apple-180.png
js/app.js               avvio, router hash, tema, registrazione SW
js/store.js             unico modulo che scrive su localStorage; CRUD; evento change; backup; scheduling sync
js/logic.js             date, programma attivo, previsti, rotazione, costanza, serie settimane (puro)
js/metrics.js           volume, serie per gruppo, massimale, record, progressione, passo, durata (puro)
js/merge.js             validateDoc, mergeDocs (puro)
js/library.js           libreria esercizi
js/crypto.js            da Habits + gzip
js/sync.js              da Habits, generalizzato (nome file, app, truncated)
js/charts.js            da Habits (anello, heatmap, linee, barre) + barre impilate
js/bodymap.js           sagoma SVG fronte/retro, 11 zone
js/timer.js             recupero, suono Web Audio, wake lock
js/ui.js                escape, formattazione, palette, pulsanti +/−
js/views/               today, session, templates, template-edit, exercises, calendar,
                        program-edit, progress, exercise-detail, body, settings
scripts/                serve.mjs, make-icons.py (Python 3 + Pillow)
tests/                  logic, metrics, merge, sync (.test.js, node --test)
```

- `logic.js`, `metrics.js`, `merge.js` non accedono a DOM né a storage.
- `store.js` è l'unico modulo che scrive su `localStorage`; notifica le viste con un evento `change`.
- Viste: funzione `render(container, state)`; ricostruiscono il proprio contenuto a ogni `change`
  (la vista sessione aggiorna solo la riga modificata per non perdere il focus degli input).
- **Aspetto**: token e componenti di Habits; accento `--accent: #2f8f4a` (grafici, anelli, icone) e
  `--accent-strong: #267a3e` per pulsanti pieni con testo bianco (contrasto 5,3:1); tema scuro `#8edc78` per entrambi con `--on-accent: #0f1117`.
  Icona: figura anatomica frontale chiara su sfumatura diagonale verde foglia (`#8edc78 → #2f8f4a`, come Habits e Atlas), da `design/fitness-icon-source.webp` con `scripts/make-icons.py`.
- Offline: pagine dalla rete (timeout 3 s, poi cache); altri file dalla cache con aggiornamento in background; precache con `cache: 'reload'`.

## 9. Convivenza con Habits

`lucfal00.github.io/habits/` e `/fitness/` hanno la stessa origine. Su iPhone ogni app installata ha uno spazio dati separato;
su PC (Chrome/Edge) le due app condividono `localStorage`, Cache Storage e quota.

- Chiavi `localStorage` con prefisso `fitness.`; cache con prefisso `fitness-`.
- Il service worker di Fitness cancella solo le cache `fitness-*` diverse da quella corrente.
- **Prerequisito alla pubblicazione**: il service worker di Habits oggi cancella ogni cache diversa da `habits-v14` e `habits-notify`,
  quindi su PC eliminerebbe la cache di Fitness a ogni aggiornamento di Habits. Correzione in Habits: cancellare solo le chiavi che iniziano con `habits-`.

## 10. Errori

- `localStorage` non disponibile o pieno → banner d'errore persistente, sola lettura.
- JSON salvato corrotto → copia in `fitness.v1.corrupt`, avvio con documento vuoto, avviso.
- Import invalido → messaggio, nessuna modifica.
- Sync: stessa tabella di Habits (rete assente, 401, 404, password errata, contenuto non valido); gzip non supportato → "Browser non supportato per la sincronizzazione".
- Più sessioni in corso (da sync): Oggi le mostra tutte con **Riprendi**.
- Wake Lock non disponibile o rifiutato → ignorato.
- Audio: `AudioContext` creato/sbloccato al tocco su **Inizia**; se bloccato, nessun suono (solo indicazione visiva).

## 11. Test e verifica

- `node --test tests/`:
  - `logic`: programma attivo e attivazione (§6.1), settimana tipo con ciclo N e cambio anno, rotazione con e senza giorni, salti, sostituzioni, schede ripetute nella sequenza, proiezione, modifiche `plan` e ripristino, costanza (oggi non fatto, extra, saltati), serie di settimane (settimane ignorate, programma libero);
  - `metrics`: volume con riscaldamento escluso, corpo libero con/senza peso, serie per gruppo (1 / 0,5), Epley ai limiti (1, 12, 13 rip), record stretti e "prima volta", miglior carico per r, progressione per ogni tipo, passo, durata stimata con superserie;
  - `merge`: per `id` e per chiave, `plan.items: null`, modifiche libreria, validazione;
  - `sync`: API GitHub simulata (come Habits) + gzip + `truncated`/`raw_url` + errori.
- Browser (viewport mobile, server locale): crea scheda → crea e attiva programma → Oggi → allenamento con recupero e superserie → Termina → Progressi;
  calendario (sposta/salta/aggiungi); offline con service worker; sync con `fetch` simulato. La prova reale con token la esegue l'utente.

## 12. Pubblicazione

Prima la correzione di §9 in Habits. Poi repository `lucfal00/fitness`, GitHub Pages dalla branch `main`, root.
Installazione: iPhone Safari → Condividi → Aggiungi a Home; PC Chrome/Edge → Installa app. README in italiano sul modello di quello di Habits.
