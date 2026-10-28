# Fitness — Schede a più giorni: piano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-10-28-fitness-schede-design.md` (modifica della spec principale `2026-10-28-fitness-design.md`).

**Goal:** schede con più giorni, programmate N volte a settimana in rotazione che avanza solo quando ci si allena.
**Architecture:** riuso del modello esistente: giorno = template (`scheda`, `dayName`), scheda = programma `rotation` (`perWeek`, `emoji`, `color`). Logica pura in `js/logic.js`, archivio in `js/store.js`, viste in `js/views/`.

## Global Constraints

- Come il piano principale: nessuna dipendenza, date locali, UI italiana, `esc()`/`safeColor()`, input ≥ 16 px, tocco ≥ 44 px, nessuno scorrimento orizzontale da 320 px.
- Nomi e firme esistenti invariati (si aggiungono funzioni e campi). 97 test esistenti devono restare verdi.
- `sw.js`: ogni file nuovo va in `FILES`; incrementare `CACHE` a `fitness-v5`.

---

### Task 1: logica, archivio e migrazione (TDD)

**Files:** Modify `js/logic.js`, `js/store.js`, `js/merge.js` (solo se serve la validazione dei nuovi campi), `tests/logic.test.js`, `tests/ui-charts.test.js` (test dello store)

**Produces:**
- `logic.js`: `weekProgress(doc, today) → { done, target }`; `schedaOf(doc, tplId) → program|null`; `workoutLabel(doc, tplId) → string` ("Scheda · Giorno", oppure nome del template se sciolto, oppure "Allenamento libero" per `null`); `adherence` e `weekStreaks` estesi alle schede senza `days` (spec §3).
- `store.js`: `saveScheda({ id?, name, emoji, color, perWeek, days })→id`, `addSchedaDay(schedaId, { dayName, items }?)→tplId`, `saveSchedaDay(tplId, { dayName, items })`, `moveSchedaDay(tplId, dir)`, `duplicateSchedaDay(tplId)→tplId`, `deleteSchedaDay(tplId)`, `deleteScheda(id)`; riuso di `activateProgram`/`endProgram`; migrazione idempotente in `load()` (spec §2).

- [ ] Test (RED): `weekProgress` (settimana senza sessioni, 2 di 3, oltre il target, nessuna scheda attiva → `target null`); costanza con scheda `perWeek 3` senza `days` su 3 settimane (3, 2, 1 sessioni → 6/9) e settimana corrente con 1 sessione → non mancata; settimane prima di `from` escluse; serie di settimane (complete se ≥ perWeek); rotazione: Giorno 1 fatto, giorno successivo saltato → `nextRotationIndex` ancora 1; `workoutLabel`.
  Store: `saveScheda` + 3 `addSchedaDay` → 3 template con `scheda`/`dayName` e `seq` nell'ordine; `moveSchedaDay` riordina `seq`; `deleteSchedaDay` toglie da `seq` e soft-delete; `deleteScheda` soft-delete scheda e giorni; migrazione: due template sciolti → due schede da 1 giorno, seconda chiamata a `load()` non duplica.
- [ ] Implementare → GREEN (`npm test`).
- [ ] Commit `Add multi-day schede: logic, store and migration`.

### Task 2: schermate

**Files:** Modify `js/views/templates.js` (elenco schede), `js/views/template-edit.js` (editor del giorno), `js/views/today.js`, `js/views/calendar.js`, `js/app.js` (route), `sw.js` (`FILES`, `CACHE = 'fitness-v5'`), `style.css`; Create `js/views/scheda-edit.js`; Delete `js/views/program-edit.js` (route `#programma/…` → `#schede`).

- [ ] Implementare spec §4: elenco schede; editor scheda (giorni, programmazione, attiva/termina, elimina); editor del giorno su `#scheda/<id>/giorno/<tplId|nuovo>`; Oggi con "Prossimo: …" e "x/N questa settimana" e scelta scheda → giorno; Calendario con riquadro "Scheda attiva" al posto dei programmi; nomi "scheda · giorno" ovunque si mostra un allenamento (Oggi, calendario, sessione, progressi, dettaglio esercizio).
- [ ] Browser (375×812 e 320 px): flusso spec §5; console pulita salvo l'errore SW del pannello.
- [ ] Commit `Schede screens: multi-day editor, weekly target on Today`.
