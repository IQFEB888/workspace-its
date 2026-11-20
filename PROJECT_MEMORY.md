# Workspace ITS — Project Memory & Architecture Reference (`PROJECT_MEMORY.md`)

> **Scopo di questo file**: Questo documento funge da memoria storica e tecnica persistente del progetto **Workspace ITS**. Deve essere consultato e mantenuto aggiornato ad ogni modifica importante così da conservare sempre il contesto completo su architettura, regole account, struttura dati Firebase, editor degli appunti e preferenze dell'utente anche tra sessioni diverse o dopo la compattazione della chat.

---

## 1. Informazioni Generali & Versione
- **Nome Applicazione**: `Workspace ITS`
- **Versione Attuale**: `v4.0.0` (`APP_VERSION` in `src/utils/editorTools.ts`, mostrata nel badge fisso in basso a sinistra `.app-version-badge`).
- **REGOLA OBBLIGATORIA DI VERSIONING**: **Ad ogni singola modifica al codice, incrementare sempre `APP_VERSION` in `src/utils/editorTools.ts`** (e aggiornare `PROJECT_MEMORY.md`), così che l'utente possa verificare immediatamente dal badge in basso a sinistra di avere l'ultima versione su tutti i dispositivi.
- **PWA & Routing**:
  - Configurata con `vite.config.ts` (`base: './'`, `manifest: false` per evitare doppi manifest), `public/manifest.json` (`start_url: './'`, `scope: './'`), `public/sw.js` e cattura anticipata di `beforeinstallprompt` in `index.html` (`window.__deferredPwaPrompt`) per funzionare sia su AI Studio sia su GitHub Pages (`https://iqfeb888.github.io/...`) senza errori 404.
  - Hook `src/hooks/usePWAInstall.ts` + `handleInstallAppClick`: su PC attiva immediatamente il prompt di installazione nativo in alto del browser (`promptInstall()`). Se il browser blocca l'evento automatico (come Opera GX/Opera di default o quando l'app è già installata), mostra il modale guida con le istruzioni per l'icona nella barra indirizzi o la scelta facoltativa di scaricare il Launcher Desktop.

---

## 2. Autenticazione, Approvazione Utenti, Regole Super Admin & Protezione Quota Firestore
- **Database Firestore Principale**: `ai-studio-workspaceits-3bed4683-d225-4e08-9dfa-deedfa0b0a7d` sul progetto `workspace-its-10786` (`primaryFirestoreConfig` in `src/firebase.ts`).
- **Circuit Breaker Quota Firestore (`isCloudQuotaExhausted` / `markCloudQuotaExhausted` in `src/firebase.ts`)**:
  - Se il piano gratuito giornaliero di Firestore supera la quota (`resource-exhausted` / `Quota exceeded.`), l'app disattiva immediatamente la rete Firestore (`disableNetwork(db)`) per bloccare i tentativi ripetuti di backoff, scollega i listener `onSnapshot` e passa in automatico alla **Modalità Locale (`localStorage`)** senza lanciare eccezioni bloccanti né disconnettere l'utente.
- **Super Admin (Unico Amministratore)**:
  - Email: `beccalli.fabio4@gmail.com` (`SUPER_ADMIN_EMAILS` in `src/services/workspaceService.ts` e `isAdmin()` in `firestore.rules`).
  - Qualsiasi altro account (inclusi altri account con lo stesso nome) **NON** è amministratore e richiede l'approvazione manuale del Super Admin.
- **Sessione Isolata per Google Calendar Personale (`calendarAuth`)**:
  - In `src/firebase.ts`, `calendarAuth` usa un'istanza Firebase secondaria isolata con `inMemoryPersistence` (`CalendarOAuthClient`) sul progetto `workspace-its-10786` (dove i domini dell'app sono già autorizzati). Questo permette di collegare un account `@gmail.com` personale solo per leggere/sincronizzare Google Calendar senza mai disconnettere o sostituire la sessione principale dell'utente nell'app.

---

## 3. Editor degli Appunti (`#notes-area`), Drag & Drop FLIP Schede & Strumenti Studio Avanzati (`v4.0.0`)
L'editor `#notes-area` in `src/App.tsx` (supportato da `src/utils/editorTools.ts`, `src/utils/studyTools.ts`, `src/utils/mindMapGraph.ts` e `src/utils/sqlEngine.ts`) include:
1. **Riordino Schede Drag-and-Drop FLIP Fluido (`reorderPagesList` + `useLayoutEffect`) & Scorrimento Laterale Direzionale (`computeTabSlideDirection`)**:
   - Ogni scheda nella barra `.vscode-tabs-bar` (sia Personale sia Stanze Condivise) scambia posizione **live durante il trascinamento** con animazione CSS FLIP (`translate3d` 260ms `cubic-bezier(0.22, 1, 0.36, 1)`) stile browser moderni e salva l'ordine finale (`order: 0..n-1`) su `localStorage` e Firestore.
   - Il cambio scheda o materia esegue lo scorrimento laterale direzionale (`note-slide-from-right` / `note-slide-from-left`).
2. **Suite Strumenti di Studio (`src/components/`)**:
   - **🧠 Studio Flashcard 3D & Quiz (`StudyReviewModal.tsx`)**: accessibile direttamente dal **menu laterale (`.apps-grid`)** e dalla **barra superiore (`.tabs-container`)** oltre a `Ctrl+K`. Layout a 2 colonne con **pulsante Zoom a schermo intero** (`⤢`/`⤡`) in alto a destra accanto alla `✕`. All'apertura **non genera nulla automaticamente** e nessuna pagina parte spuntata: cliccare il nome o la checkbox di una scheda nella barra sinistra la seleziona/deseleziona e la generazione (`gemini-3.6-flash` + fallback locale) parte **solo premendo Genera**. Ogni flashcard mostra **badge con icona + bordo colorato** (Verde `✓ So bene` / Ambra `↻ Da ripassare`) sia sul fronte sia sul retro, accompagnato da una **barra di pallini numerati cliccabili**; lo stesso vale per i **Quiz** con stato automatico (Verde `✓ Esatta` / Rosso `✕ Errata`). Include **Storico Sessioni persistente** (`ws_study_review_history_v1` in `localStorage`) per entrambe le modalità.
   - **🗺️ Studio Mappa Concettuale Interattiva (`MindMapModal.tsx` + `src/utils/mindMapGraph.ts`)**: accessibile direttamente dalla **barra superiore (`.tabs-container`)**, dal **menu laterale (`.apps-grid`)** e da `Ctrl+K`. Layout a 2 colonne con barra sinistra di **selezione multipla delle schede (checkbox)** e **Storico Mappe persistente** (`ws_mindmap_history_v1`). Supporta **generazione AI dedicata con `gemini-3.6-flash`** + **Estrazione Rapida Locale** + **Mappa Libera da zero**, **pulsante Fullscreen** accanto alla `✕`, **zoom esteso dal 25% fino al 500%** (rotella + pulsanti) e **Modalità Modifica integrata (pulsante matita `Modifica`)** per trascinare liberamente le box, ridimensionarle (preset `S/M/L/XL`, `A−/A+` e maniglia angolare), cambiare colori (8 tinte), modificare titolo e contenuto, creare/stilizzare/eliminare collegamenti Bézier, riordinare automaticamente il layout ed esportare in `.svg`.
   - **⚡ Command Palette (`CommandPaletteModal.tsx`, `Ctrl+K`)**: ricerca istantanea su schede, materie, PDF/materiali, azioni rapide e creazione diretta di promemoria in calendario. **Selezione tastiera (`↑`/`↓`) e hover mouse disaccoppiati con colori distinti**: Indaco/Viola con barra laterale sinistra e badge `↵ Invio` per la selezione attiva da tastiera vs Turchese/Teal per il solo passaggio del mouse.
   - **🎙️ Dettatura Vocale Lezioni (`VoiceDictationBar.tsx`)**: trascrizione vocale live Web Speech API (`it-IT`) con onde audio animate, inserimento diretto negli appunti o riordino automatico con `gemini-3.6-flash`.
   - **🔀 Vista Split-Screen (`SplitScreenPane.tsx`)**: apre a destra dell'editor un'altra scheda di appunti (di qualsiasi materia) oppure una dispensa PDF / immagine dalla libreria Materiali.
   - **📄 Esportazione Dispensa (`ExportDispensaModal.tsx`)**: esporta la singola scheda o l'intera materia con copertina universitaria, indice/sommario automatico e 3 temi in **PDF professionale (stampa)**, **Word (`.doc`)** e **Markdown (`.md`)**.
3. **Box Codice, Bash Locale, SQL Relazionale & Routing Modelli Gemini (`src/services/geminiService.ts`)**:
   - Interprete Bash locale (`runBashLocally`), SQL relazionale (`sqlEngine.ts`), conversione Chat -> Box Codice/Formule/Citazioni (`convertAiMarkdownToNoteHtml`), modifica in-place (`applyTargetedBoxReplacement`).
   - I modelli visibili nel selettore Chat restano sempre `3.8 Flash`, `3.8 Pro` e `3.6 Flash`: la Chat AI utilizza **esattamente il modello selezionato** dall'utente (nessuna riscrittura verso `gemini-2.5-flash`), mentre Flashcard, Quiz e Dettatura Vocale usano `gemini-3.6-flash`.
4. **Persistenza Scroll, Incolla Intelligente, Foto 8 Maniglie & Barra Collassabile**:
   - Persistenza `scrollTop` per scheda, incolla testo prioritario su screenshot, cornice ridimensionamento foto/disegni a 8 maniglie, collasso barra strumenti appunti.

---

## 4. Calendario Studi & Lezioni (`StudyCalendarPanel.tsx`), Viste Giorno/Settimana/Mese/Agenda & AI Chat Integration
- **4 Viste Calendario (`Giorno`, `Settimana`, `Mese`, `Agenda`)** con propagazione Firestore protetta contro loop (`syncedCalendarIdsRef`) e comandi vocali/testuali in Chat AI (`parseCalendarChatCommand`, `answerCalendarQueryLocally`).




