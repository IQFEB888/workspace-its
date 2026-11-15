# Workspace ITS — Project Memory & Architecture Reference (`PROJECT_MEMORY.md`)

> **Scopo di questo file**: Questo documento funge da memoria storica e tecnica persistente del progetto **Workspace ITS**. Deve essere consultato e mantenuto aggiornato ad ogni modifica importante così da conservare sempre il contesto completo su architettura, regole account, struttura dati Firebase, editor degli appunti e preferenze dell'utente anche tra sessioni diverse o dopo la compattazione della chat.

---

## 1. Informazioni Generali & Versione
- **Nome Applicazione**: `Workspace ITS`
- **Versione Attuale**: `v3.4.0` (`APP_VERSION` in `src/utils/editorTools.ts`, mostrata nel badge fisso in basso a sinistra `.app-version-badge`).
- **REGOLA OBBLIGATORIA DI VERSIONING**: **Ad ogni singola modifica al codice, incrementare sempre `APP_VERSION` in `src/utils/editorTools.ts`** (e aggiornare `PROJECT_MEMORY.md`), così che l'utente possa verificare immediatamente dal badge in basso a sinistra di avere l'ultima versione su tutti i dispositivi.
- **PWA & Routing**:
  - Configurata con `vite.config.ts` (`base: './'`), `public/manifest.json` (`start_url: './'`, `scope: './'`), `public/sw.js` e cattura anticipata di `beforeinstallprompt` in `index.html` (`window.__deferredPwaPrompt`) per funzionare sia su AI Studio sia su GitHub Pages (`https://iqfeb888.github.io/...`) senza errori 404.
  - Hook `src/hooks/usePWAInstall.ts` + `handleInstallAppClick`: su PC attiva immediatamente il prompt di installazione nativo del browser (se supportato da Chrome/Edge) oppure scarica il launcher standalone **`Workspace ITS Desktop.html`** (evitando file `.url` che Opera/Chromium convertono in testo `[InternetShortcut]`).

---

## 2. Autenticazione, Approvazione Utenti & Regole Super Admin
- **Database Firestore Principale**: `ai-studio-workspaceits-3bed4683-d225-4e08-9dfa-deedfa0b0a7d` sul progetto `workspace-its-10786` (`primaryFirestoreConfig` in `src/firebase.ts`).
- **Super Admin (Unico Amministratore)**:
  - Email: `beccalli.fabio4@gmail.com` (`SUPER_ADMIN_EMAILS` in `src/services/workspaceService.ts` e `isAdmin()` in `firestore.rules`).
  - Qualsiasi altro account (inclusi altri account con lo stesso nome) **NON** è amministratore e richiede l'approvazione manuale del Super Admin.
- **Sessione Isolata per Google Calendar Personale (`calendarAuth`)**:
  - In `src/firebase.ts`, `calendarAuth` usa un'istanza Firebase secondaria isolata con `inMemoryPersistence` (`CalendarOAuthClient`) sul progetto `workspace-its-10786` (dove i domini dell'app sono già autorizzati). Questo permette di collegare un account `@gmail.com` personale solo per leggere/sincronizzare Google Calendar senza mai disconnettere o sostituire la sessione principale dell'utente nell'app.

---

## 3. Editor degli Appunti (`#notes-area`) & Strumenti Avanzati
L'editor `#notes-area` in `src/App.tsx` (supportato da `src/utils/editorTools.ts` e `src/utils/sqlEngine.ts`) include:
1. **Persistenza Posizione di Scorrimento (`scrollTop`)**:
   - Un `useEffect` dedicato salva `scrollTop` in `localStorage` per ogni materia e scheda (`ws_notes_scroll_personal_...` e `ws_notes_scroll_map`) e ripristina la posizione esatta sia al cambio scheda/materia/tab sia al ricaricamento della pagina (`F5`).
2. **Incolla Intelligente Testo vs Screenshot (`Ctrl+V`)**:
   - Sia negli appunti (`handleNotesPaste`) sia nella Chat AI (`handleChatPaste`), se gli appunti di sistema contengono `text/plain` non vuoto viene sempre incollato il testo copiato senza mai ri-allegare un vecchio screenshot.
3. **Box di Codice Interattive (`💻 Codice`) & Motore SQL Relazionale Locale**:
   - Esecuzione diretta (`▶ Esegui`) senza chiave API per:
     - **SQL (`src/utils/sqlEngine.ts`)**: motore relazionale persistente in `localStorage` che supporta `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE`, `TRUNCATE`, `INSERT INTO`, `UPDATE`, `DELETE`, `SHOW TABLES`, `DESCRIBE` e `SELECT` con `JOIN`, `WHERE`, `GROUP BY`, `ORDER BY`, `LIMIT` e output tabellare ASCII.
     - **JavaScript / TypeScript, HTML/CSS, JSON** (locali nel browser) e **Python, C/C++, Java, PHP, Bash** (tramite Wandbox API keyless).
4. **Foto Ridimensionabili dai Bordi (8 Maniglie) & Disegni Modificabili dopo `Esc`**:
   - Cliccando una foto o un tratto disegnato (anche dopo aver premuto `Esc`), compare la cornice `.note-object-selection-frame` con 8 maniglie trascinabili (`nw, n, ne, e, se, s, sw, w`), trascinamento libero col mouse e pulsante `🗑️ Elimina` (oltre ai tasti `Canc` / `Backspace`).
5. **Barra Orizzontale Semplificata per il Disegno (`isDrawingMode`), Collasso Barra Strumenti & Animazione Slide-Down**:
   - Rimosso il vecchio tasto `⛶ Massimizza Spazio` e sostituito con il controllo di collasso della barra strumenti degli appunti (`isEditorToolbarCollapsed`, persistito in `localStorage`) tramite i pulsanti in alto a destra (`🛠️ ▲ Nascondi Strumenti` / `🛠️ ▼ Strumenti`, `▲` nella barra delle schede e `▲ Nascondi` a destra nella barra strumenti).
   - Quando `isDrawingMode` è attivo, la barra superiore dell'editor viene sostituita da un'unica barra orizzontale minimale con **✏️ Penna**, **🧹 Gomma**, colori rapidi, **↩️ Annulla**, **🗑️ Pulisci** e **✓ Chiudi Penna**, evitando qualsiasi doppia barra sovrapposta.
   - Sia `.editor-toolbar` sia `.notes-drawing-bar` utilizzano l'animazione `@keyframes toolbarSlideDown` (`toolbar-slide-down`) per comparire con una transizione fluida dall'alto verso il basso.

---

## 4. Calendario Studi & Lezioni (`StudyCalendarPanel.tsx`), Viste Giorno/Settimana/Mese/Agenda & AI Chat Integration
- **4 Viste Calendario (`Giorno`, `Settimana`, `Mese`, `Agenda`)**:
  - **⏰ Giorno (`'day'`)**: timeline oraria (`07:00`–`21:00`) con inserimento rapido 1-click (`+ Aggiungi alle HH:00`) su ogni fascia oraria.
  - **📊 Settimana (`'week'`)**: bacheca settimanale a 7 colonne (`Lun`–`Dom`) con card degli impegni e pulsante `+` su ogni giorno.
  - **🗓️ Mese (`'month'`)** e **📋 Agenda (`'agenda'`)**.
- **Propagazione Firestore & Listener Cloud (`users/{uid}/calendar_events`)**:
  - `saveCalendarEventToCloud` sanitizza tutti i campi (evitando `googleEventId: undefined` che bloccava `setDoc` in Firestore) e il listener `onCalendarEvents` unisce gli eventi locali e cloud senza mai sovrascrivere gli eventi appena creati.
- **Comandi Vocali/Testuali Calendario nella Chat AI (`parseCalendarChatCommand` & `buildCalendarScheduleContextForChat`)**:
  - Scrivendo in chat frasi come *"aggiungi un promemoria per domani alle 15:30 per studiare Database"* l'evento viene creato automaticamente nel Calendario (e su Google Calendar personale se collegato).
  - Scrivendo domande come *"che materie ho domani?"* o *"che impegni ho questa settimana?"*, la Chat AI ha visibilità completa sul calendario (e risponde anche senza API key tramite `answerCalendarQueryLocally`).
