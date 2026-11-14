# Workspace ITS — Project Memory & Architecture Reference (`PROJECT_MEMORY.md`)

> **Scopo di questo file**: Questo documento funge da memoria storica e tecnica persistente del progetto **Workspace ITS**. Deve essere consultato e mantenuto aggiornato ad ogni modifica importante così da conservare sempre il contesto completo su architettura, regole account, struttura dati Firebase, editor degli appunti e preferenze dell'utente anche tra sessioni diverse o dopo la compattazione della chat.

---

## 1. Informazioni Generali & Versione
- **Nome Applicazione**: `Workspace ITS`
- **Versione Attuale**: `v2.6.0` (`APP_VERSION` in `src/utils/editorTools.ts`, mostrata nel badge fisso in basso a sinistra `.app-version-badge`).
- **PWA & Routing**:
  - Configurata con `vite.config.ts` (`base: './'`), `public/manifest.json` (`start_url: './'`, `scope: './'`) e `public/sw.js` per funzionare sia su AI Studio sia su GitHub Pages (`https://iqfeb888.github.io/...`) senza errori 404 quando installata come app desktop/mobile.
  - Hook `src/hooks/usePWAInstall.ts`: mostra il pulsante `💻 Scarica App` quando l'app non è installata e lo nasconde automaticamente quando è installata o aperta in modalità standalone.

---

## 2. Autenticazione, Approvazione Utenti & Regole Super Admin
- **Database Firestore**: `ai-studio-workspaceits-3bed4683-d225-4e08-9dfa-deedfa0b0a7d` (`firebase-applet-config.json`).
- **Super Admin (Unico Amministratore)**:
  - Email: `beccalli.fabio4@gmail.com` (`SUPER_ADMIN_EMAILS` in `src/services/workspaceService.ts` e `isAdmin()` in `firestore.rules`).
  - Qualsiasi altro account (inclusi altri account con lo stesso nome) **NON** è amministratore e richiede l'approvazione manuale del Super Admin.
- **Flusso di Approvazione & Revoca in Tempo Reale**:
  - Gli utenti non ancora approvati vedono la schermata **"In attesa di approvazione"** con ascolto in tempo reale (`subscribeToUserApprovalStatus` + controllo automatico ogni 2.5s) senza bisogno di ricaricare la pagina.
  - Dalla schermata di attesa i pulsanti **"Cambia Account Google"** e **"Disconnetti account"** eseguono il logout immediato senza aprire dialoghi bloccanti sotto la finestra.
  - La revoca dell'accesso da parte dell'Admin (`revokeUserAccess`) elimina sia il documento per UID sia eventuali documenti per email in `approved_users` e riporta `access_requests/{uid}` a `revoked`, bloccando in tempo reale la sessione dell'utente revocato.

---

## 3. Editor degli Appunti (`#notes-area`) & Strumenti Avanzati
L'editor `#notes-area` in `src/App.tsx` (supportato dalle funzioni pure in `src/utils/editorTools.ts`) include:
1. **Dimensione Testo in Pixel Esatti (`px`)**:
   - Selettore numerico `8px–96px` con pulsanti `−` / `+` e preset rapidi (`13`, `15`, `18`, `22`, `28`).
2. **Colori Rapidi Personalizzabili + Ruota dei Colori (`🎨`) + Eliminazione (`×`)**:
   - Presenti per **Evidenziatore (`🖍️`)**, **Colore Testo (`A`)**, **Penna Disegno (`✏️`)**, **Menu Tasto Destro** e **Impostazioni (`🖌️ Tema & Colori`)**.
   - Scegliendo un colore dalla ruota colori `<input type="color">`, il colore viene applicato e salvato automaticamente nelle palette rapide (`savedTextColors`, `savedHighlightColors`, `savedPenColors`), sincronizzate su localStorage e Cloud Firestore.
   - Ogni colore rapido (inclusi i predefiniti) può essere eliminato tramite il badge `×` (`.swatch-del-badge`).
3. **Box di Codice Interattive (`💻 Codice`)**:
   - Inserimento diretto negli appunti (`.note-code-block`) senza modale intermedio.
   - Menu a tendina integrato (`.note-code-lang-select`) per cambiare linguaggio con syntax highlighting live (`highlightCodeSyntax`).
   - Supporto nativo per `Tab` / `Shift+Tab` e auto-indentazione su `Invio` dentro cicli/blocchi (`computeCodeKeyDownEdit`).
   - Pulizia automatica (`sanitizeAndUpgradeNoteHtml`) di eventuali vecchie box di codice bloccate in cima agli appunti.
4. **Box Formule & Calcoli Live (`∑ Formula / =`)**:
   - Inserimento diretto (`.note-formula-box`) che calcola in tempo reale espressioni matematiche (`evaluateMathExpression`) mentre si scrive dentro `.note-formula-input`.
5. **Tabelle Interattive (`📊 Tabella`)**:
   - Inserimento tabelle `.note-table-wrapper > table.note-table`.
   - Cliccando in una cella compare la barra flottante `.note-table-floating-bar` per aggiungere/eliminare righe sopra/sotto, colonne a sinistra/destra o eliminare l'intera tabella.
6. **Immagini & Screenshot Liberamente Spostabili + Ancora (`📌 Fissa / 🔓 Sblocca`)**:
   - Incollaggio rapido screenshot (`Ctrl+V`) sia negli appunti sia nella Chat AI (compressi tramite `compressImageFromBlob`).
   - Cliccando un'immagine in `#notes-area` compare `.note-image-floating-bar` con le modalità stile Word:
     - `inline` (In linea), `wrap-left` (Testo a Destra), `wrap-right` (Testo a Sinistra), `behind` (Dietro al Testo), `front` (Davanti al Testo / Libera).
   - Pulsante **Ancora (`📌 Fissata / 🔓 Sbloccata`)** per bloccare la foto o trascinarla liberamente col mouse in coordinate `(left, top)` dentro `#notes-area`.
7. **Penna Disegno a Mano Libera (`✏️ Penna`)**:
   - Attiva la barra `.notes-drawing-bar` e disegna su un livello SVG (`svg.note-drawing-svg`) sovrapposto sia al testo sia alle foto negli appunti.
   - Strumenti: `Penna`, `Evidenziatore`, `Freccia`, `Linea`, `Box`, `Gomma Tratto`, spessore `2px–12px`, `Annulla Tratto` e `Pulisci Tutto`.
8. **Ricerca e Sostituzione (`Ctrl+F`) & Menu Tasto Destro Intelligente**:
   - Barra di ricerca flottante `.notes-find-bar` con conteggio occorrenze e sostituzione.
   - Menu contestuale tasto destro (`.custom-context-menu`) suddiviso in box tematiche e con posizionamento automatico (`computeContextMenuPosition`) che si apre verso l'alto/sinistra se vicino ai bordi dello schermo.

---

## 4. Layout Multi-Colonna, Temi & Widget Modulari (`WorkspaceWidgetsDock.tsx`)
- **Temi & Sfondi (`SettingsModal.tsx`)**:
  - Sfondi fotografici e **Sfondi Monocolore** (`Nero Assoluto OLED`, `Grigio Grafite`, `Blu Notte`, `Verde Foresta`, `Bordeaux`, `Lavanda`), **Modalità Minimal / Compatta**, colori d'accento (inclusa ruota colori libera) e temi per barre superiori/laterali.
- **Scorciatoie da Tastiera Programmabili (`⌨️ Scorciatoie Tasti`)**:
  - Tutte le azioni principali sono associabili a combinazioni di tasti personalizzate (`customShortcuts`) registrabili dalle Impostazioni.
- **Widget Modulari (`pdf_viewer`, `image_viewer`, `web_embed`, `calculator`, `pomodoro`, `quick_scratch`)**:
  - Posizionabili in 4 slot:
    1. `full_column` (**Nuova Colonna Grande Dedicata** — ridimensionabile trascinando direttamente il bordo laterale `.widget-column-resizer`).
    2. `right_bottom` (**Sotto la Chat AI** — con slider di ripartizione verticale).
    3. `center_bottom` (**Sotto gli Appunti**).
    4. `left_bottom` (**Sotto la Barra Laterale Strumenti**).
  - **Nota Tecnica Widget PDF**: I PDF salvati in base64 o IndexedDB vengono convertiti in Blob URL forzando sempre `type: 'application/pdf'` (mai `application/octet-stream`) e i link Google Drive vengono convertiti in `/preview` tramite `toSafeEmbedPdfUrl`, con `<iframe key={resolvedPdfUrl} />`, così il cambio PDF dal menu a tendina sostituisce sempre il documento nel widget senza mai avviare un download.
