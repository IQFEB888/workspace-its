# Workspace ITS — Project Memory & Architecture Reference (`PROJECT_MEMORY.md`)

> **Scopo di questo file**: Questo documento funge da memoria storica e tecnica persistente del progetto **Workspace ITS**. Deve essere consultato e mantenuto aggiornato ad ogni modifica importante così da conservare sempre il contesto completo su architettura, regole account, struttura dati Firebase, editor degli appunti e preferenze dell'utente anche tra sessioni diverse o dopo la compattazione della chat.

---

## 1. Informazioni Generali & Versione
- **Nome Applicazione**: `Workspace ITS`
- **Versione Attuale**: `v3.8.0` (`APP_VERSION` in `src/utils/editorTools.ts`, mostrata nel badge fisso in basso a sinistra `.app-version-badge`).
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

## 3. Editor degli Appunti (`#notes-area`), Drag & Drop FLIP Schede & Strumenti Studio Avanzati (`v3.8.0`)
L'editor `#notes-area` in `src/App.tsx` (supportato da `src/utils/editorTools.ts`, `src/utils/studyTools.ts` e `src/utils/sqlEngine.ts`) include:
1. **Riordino Schede Drag-and-Drop FLIP Fluido (`reorderPagesList` + `useLayoutEffect`) & Scorrimento Laterale Direzionale (`computeTabSlideDirection`)**:
   - Ogni scheda nella barra `.vscode-tabs-bar` (sia Personale sia Stanze Condivise) scambia posizione **live durante il trascinamento** con animazione CSS FLIP (`translate3d` 260ms `cubic-bezier(0.22, 1, 0.36, 1)`) stile browser moderni e salva l'ordine finale (`order: 0..n-1`) su `localStorage` e Firestore.
   - Il cambio scheda o materia esegue lo scorrimento laterale direzionale (`note-slide-from-right` / `note-slide-from-left`).
2. **Suite Strumenti di Studio (`src/components/`)**:
   - **🧠 Studio Flashcard 3D & Quiz (`StudyReviewModal.tsx`)**: accessibile direttamente dal **menu laterale (`.apps-grid`)** e dalla **barra superiore (`.tabs-container`)** oltre a `Ctrl+K`. Layout a 2 colonne con **barra laterale sinistra** contenente: selettore multi-pagina (checkbox per selezionare quali pagine di appunti usare + click diretto su una scheda per generare subito nuove flashcard/quiz) e **Storico Sessioni persistente** (`ws_study_review_history_v1` in `localStorage`) sia per Flashcard che per Quiz per rivedere tutti i set generati in precedenza con relativi progressi. Usa sempre **`gemini-3.6-flash`** (`STUDY_GENERATION_MODEL`) con fallback locale affidabile.
   - **🗺️ Mappa Concettuale Automatica (`MindMapModal.tsx`)**: grafo SVG interattivo con rami Bézier colorati estratti automaticamente da titoli, elenchi, codice e formule, con pan, zoom, compressione rami ed export `.svg`.
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




