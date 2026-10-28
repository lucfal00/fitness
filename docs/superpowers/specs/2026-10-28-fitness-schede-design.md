# Fitness — Schede a più giorni (modifica alla spec)

Data: 2026-10-28
Stato: approvato dall'utente. Modifica `2026-10-28-fitness-design.md`: dove questa nota contraddice la spec principale, vale questa.

## 1. Obiettivo

Una **scheda** contiene più **giorni** (Giorno 1, 2, 3… rinominabili), ognuno con i suoi esercizi.
La scheda si programma **N volte a settimana** e gira in **rotazione che avanza solo quando ti alleni**:
se salti un allenamento, la volta dopo l'app ripropone lo stesso giorno. Nessuno spostamento manuale.

## 2. Modello (riuso di quello esistente)

- Un **giorno** è un template esistente (`templates[]`) con due campi nuovi: `scheda` (id del programma) e `dayName` (nome del giorno).
  Sessioni, record, progressione e statistiche continuano a riferirsi al template (nessuna migrazione dei dati di allenamento).
- Una **scheda** è un programma (`programs[]`) di `kind: "rotation"` con campi nuovi:
  `emoji`, `color`, `perWeek` (1–7, obbligatorio per le schede), e i campi esistenti `seq` (= ordine dei giorni, id dei template),
  `days` (giorni preferiti 1–7 oppure `null`), `from`/`to` (attivazione, §6.1 invariato).
- Il nome visualizzato di un allenamento è `"<nome scheda> · <dayName>"`.
- **Migrazione all'avvio** (idempotente, nel caricamento del documento): ogni template non eliminato senza `scheda` viene avvolto
  in una scheda da 1 giorno (`name` = nome del template, `perWeek: 1`, `days: null`, `from: null`), con `template.scheda` e `dayName = "Giorno 1"`.
  I programmi `week`/`free` esistenti restano validi per i calcoli ma non hanno più una schermata di modifica.

## 3. Regole (estendono la spec §6)

- **Previsti** (§6.2) per una scheda attiva (rotazione):
  - con `days`: invariato (un previsto nei giorni preferiti, proiezione del prossimo giorno della rotazione);
  - senza `days`: nessun previsto per data; Oggi mostra sempre "Prossimo: <giorno>" (come la rotazione senza giorni).
- **Rotazione** (§6.3): invariata (avanza solo completando il giorno proposto; i giorni saltati non consumano posizioni).
- **Obiettivo settimanale**: `weekProgress(doc, today) → { done, target }` per la settimana lun–dom che contiene `today`:
  `target = perWeek` della scheda attiva (o `null` senza scheda attiva), `done` = sessioni concluse della settimana (qualsiasi scheda o libere), fino a oggi.
- **Costanza** (§6.4) per un periodo in cui la scheda attiva non ha `days`: `Σ min(done_w, perWeek) / Σ perWeek` sulle settimane del periodo,
  contando solo settimane già iniziate e, per quella corrente, `perWeek` sostituito da `min(done_w, perWeek)` (la settimana in corso non conta come mancata).
  Con `days` resta la regola per giorno. Più programmi nel periodo: si sommano i contributi di ciascuno sui giorni/settimane in cui è attivo
  (una settimana appartiene alla scheda attiva il suo lunedì; se nessuna, alla prima attiva nella settimana).
- **Serie di settimane** (§6.5): per una scheda senza `days` la settimana è completa se `done_w ≥ perWeek`; settimana corrente contata se completa, altrimenti ignorata.

## 4. Schermate

- **Schede** (tab): elenco delle schede (attiva in evidenza, poi le altre, archiviate in fondo) con emoji, colore, numero di giorni, "N volte a settimana".
  "Nuova scheda".
- **Scheda** (`#scheda/<id|nuova>`): nome (1–40), emoji, colore; **Giorni**: elenco con nome, numero esercizi, durata stimata;
  aggiungi giorno, rinomina, riordina (su/giù), duplica, elimina (conferma); tocco su un giorno → editor del giorno.
  **Programmazione**: "Volte a settimana" (1–7), "Giorni preferiti" facoltativi (lun…dom, solo per vederli nel calendario).
  **Attiva** (data di inizio, default oggi) / **Termina** (§6.1). Elimina scheda (conferma; soft delete della scheda e dei suoi giorni).
- **Giorno** (`#scheda/<id>/giorno/<tplId|nuovo>`): l'editor attuale dei template (esercizi, serie, superserie, riscaldamento, recupero, note),
  con il nome del giorno al posto del nome scheda; "Salva" torna alla scheda.
- **Oggi**: card della scheda attiva con "Prossimo: <dayName>" (o il giorno previsto se ci sono giorni preferiti), elenco esercizi, durata stimata, **Inizia**;
  sotto, "x/N questa settimana". "Allenati comunque" / scelta manuale: elenco schede → giorni, più "Allenamento libero".
  Senza schede: invito a creare la prima.
- **Calendario**: invariato per i giorni (fatti, previsti con giorni preferiti, sposta/salta/sostituisci/aggiungi, aggiungi allenamento passato);
  la sezione "Programmi" è sostituita da un riquadro "Scheda attiva" con link alla scheda. La route `#programma/...` reindirizza a `#schede`.
- **Riepilogo fine allenamento**, progressione, record: invariati (il nome mostrato è "scheda · giorno").

## 5. Test

- Logica: `weekProgress`; costanza e serie di settimane con scheda senza `days` (settimana corrente non mancata, settimane prima dell'attivazione escluse,
  cambio di scheda a metà periodo); rotazione invariata con giorni saltati.
- Archivio: creazione/modifica scheda con giorni (template con `scheda`/`dayName`, `seq` in ordine), riordino, eliminazione di un giorno (fuori da `seq`, soft delete),
  eliminazione scheda, migrazione idempotente dei template sciolti.
- Browser: crea scheda 3 giorni → 3 volte a settimana → attiva → Oggi propone Giorno 1 → fai Giorno 1 → il giorno dopo propone Giorno 2;
  salta un giorno → ancora Giorno 2; contatore settimanale; calendario con giorni preferiti.
