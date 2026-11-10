# Piano di Implementazione: Impostazioni Avanzate, UI Materiali e Ottimizzazione Widget

## Titolo & Sommario
Riprogettazione e potenziamento dell'interfaccia utente di Workspace ITS: integrazione di un pannello **Impostazioni Avanzate** completo (sfondi, font editor, dimensioni testo, gestione widget, chiavi API), risoluzione del layout compatto della barra laterale per il meteo con scrollbar scure sottili, espansione e redesign delle **schede materiali** per evitare nomi troncati, e rifinitura dei pulsanti di esportazione note su Google Drive e download locale.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Decisioni confermate con l'utente (Fase 1):**
> 1. **Pulsante Impostazioni**: Posizionato nella barra superiore in alto (icona ingranaggio `⚙️ Impostazioni`), raggruppando anche la selezione degli sfondi e rimuovendo il pulsante singolo "Sfondo" dalla topbar.
> 2. **Schede Materiali**: Riorganizzate con griglia più ampia (`minmax(340px, 1fr)`), titoli su due righe senza troncamento prematuro e pulsanti di azione più compatti.
> 3. **Opzioni nel pannello Impostazioni**: Selezione famiglia font per gli appunti (`Plus Jakarta Sans`, `Inter`, `Outfit`, `JetBrains Mono`, `Serif`), slider/selettore dimensione testo (13px–19px), e toggle per mostrare/nascondere il widget meteo nella sidebar.

---

## 1. Overview & Core Concept
- **Obiettivo**: Offrire uno spazio di studio altamente personalizzabile, pulito ed esente da glitch visivi.
- **Valore per lo studente**: 
  - Accesso centralizzato a tutte le preferenze (sfondi, font, dimensioni, widget, API) senza disperdere controlli nella barra superiore.
  - Lettura immediata e completa dei titoli di slide e PDF caricati nei corsi.
  - Widget meteo compatto e stabile anche con barra laterale compressa, con scrollbar scure ed eleganti.
  - Salvataggio rapido delle note personali su Google Drive e download locale senza errori di layout.

---

## 2. User Experience & Visual Design

### A. Nuovo Pannello Impostazioni Avanzate (`SettingsModal`)
- **Accesso**: Icona `⚙️ Impostazioni` nella barra superiore, tra Cloud Sync e Focus Mode.
- **Struttura a schede interne**:
  1. **🎨 Aspetto & Sfondi**:
     - Griglia visiva con anteprime dei 10 sfondi disponibili (trasferita dalla topbar, con badge sullo sfondo attivo e selezione immediata a 1 clic).
     - **Tipografia Appunti**: Scelta tra font moderni sans-serif e monospace (`Plus Jakarta Sans`, `Inter`, `Outfit`, `JetBrains Mono`, `Playfair Serif`).
     - **Dimensione Testo**: Selettore rapido (Compatto 13px, Standard 15px, Grande 17px, Molto Grande 19px) con applicazione istantanea all'editor.
  2. **🧩 Widget & Layout**:
     - Interruttore Mostra/Nascondi Widget Meteo nella barra laterale.
     - Selezione rapida della sede ITS preferita (Seregno, Milano, Roma, ecc.).
     - Interruttori per Focus Mode e Compressione automatica barra laterale.
  3. **🔑 Chiavi API & Modelli AI**:
     - Visualizzazione, aggiunta e cancellazione delle chiavi API Google Gemini salvate.
     - Selezione del modello AI predefinito (Gemini 2.5 Flash, 2.5 Pro, ecc.).
  4. **👤 Account & Sincronizzazione**:
     - Dettagli profilo Google (`beccalli.fabio4@gmail.com`), stato Firestore e opzione di esportazione/backup JSON offline.

### B. Schede Materiali e Dispense (Riprogettate)
- **Nuovo Layout Scheda**:
  - Min-width aumentata da `250px` a `340px` (griglia fluida `repeat(auto-fill, minmax(340px, 1fr))`).
  - Spazio per il titolo esteso su 2 righe con `line-clamp-2`, `word-break: break-word`, e tooltip nativo con il nome completo del file.
  - Icona materiale più grande (`40px × 40px`) con badge di tipo risorsa (PDF, Slide, Immagine, Link).
  - Gruppo pulsanti più compatto (`height: 24px`, padding `3px 7px`, icone discrete) per `👁️ Anteprima`, `🧠 Chiedi all'AI`, `↗ Apri` ed elimina.

### C. Widget Meteo e Barra Laterale
- **Risoluzione Overflow in Barra Collassata**:
  - Correzione selettori CSS: aggiunta regola per `.weather-card-widget` in modalità `.sidebar-collapsed`.
  - In stato collassato (76px), il widget si trasforma in un'icona compatta centrata con temperatura (`🌤️ 10°`), senza fuoriuscire dalla barra.
- **Scrollbar Scure e Sottili**:
  - Applicazione di regole `scrollbar-width: thin` e `::-webkit-scrollbar` traslucide dark (`rgba(255,255,255,0.2)`) alla finestra di dialogo meteo e a tutte le sezioni a scorrimento (forecast 24h e orizzontale), eliminando le barre bianche di default del browser.

### D. Barra Strumenti Editor Appunti
- Pulsanti `☁️ Salva su Drive` e `💾 Scarica` rifiniti graficamente con badge visivi coerenti, feedback durante il salvataggio (`⏳...`) e gestione automatica dei token.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisione 1: Raggruppamento Sfondi nelle Impostazioni**:
  - *Scelta*: Rimuovere il pulsante dedicato "Sfondo" dalla barra superiore e inserire una galleria visiva interattiva nel pannello Impostazioni.
  - *Motivazione*: Mantiene la barra superiore pulita ed evita il ciclo continuo "al buio" degli sfondi tramite click ripetuti, permettendo di scegliere visivamente lo sfondo desiderato.
- **Decisione 2: Griglia Materiali Espansa**:
  - *Scelta*: Aumentare il min-width delle schede a 340px e ridurre le dimensioni dei pulsanti di azione.
  - *Motivazione*: I nomi dei file dei corsi universitari/ITS sono spesso lunghi (es. `Sistemi_Operativi_Lezione_03_Processi_e_Thread.pdf`); 250px costringeva a troncare oltre il 60% del nome.
- **Decisione 3: Persistenza Preferenze Font e Widget**:
  - *Scelta*: Estendere l'oggetto `UserPreferences` in `WorkspaceService` con `fontFamily`, `fontSize` e `showWeatherWidget`, memorizzandoli sia in `localStorage` sia in Cloud Firestore per sincronizzarli tra dispositivi.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          WORKSPACE ITS TOPBAR                          │
│  [Logo ITS]  [Meteo Pill]  ...  [Cloud Sync] [Focus Mode] [⚙️ Impostazioni] │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Apre
                                     ▼
                    ┌─────────────────────────────────┐
                    │      SettingsModal (Nuovo)      │
                    ├─────────────────────────────────┤
                    │ • Tab 1: Aspetto & Sfondi (10)  │
                    │   - Font Family & Font Size     │
                    │ • Tab 2: Widget & Sidebar       │
                    │   - Toggle Visibilità Meteo     │
                    │ • Tab 3: Gestione Chiavi Gemini │
                    │ • Tab 4: Account & Backup       │
                    └─────────────────────────────────┘
                                     │
                                     ▼ Salva preferenze
          ┌────────────────────────────────────────────────────────┐
          │ WorkspaceService: LocalStorage + Firestore Sync        │
          │ { bgIndex, fontFamily, fontSize, showWeatherWidget...} │
          └──────────────────────────┬─────────────────────────────┘
                                     │ Applica
                                     ▼
          ┌────────────────────────────────────────────────────────┐
          │ Main Viewport:                                         │
          │  ├── Sidebar: Widget meteo con stato collassato fisso  │
          │  ├── Editor Appunti: Font personalizzato + Salva Drive │
          │  └── Materiali: Schede allargate (min 340px) no cutoff │
          └────────────────────────────────────────────────────────┘
```

### Struttura Dati Preferenze Estesa:
```ts
export interface UserPreferences {
  bgIndex: number;
  isImmersion: boolean;
  isSidebarCollapsed: boolean;
  isChatCollapsed: boolean;
  activeSubject: string;
  activePageId: string;
  selectedModel: string;
  fontFamily?: string;       // 'plus-jakarta' | 'inter' | 'outfit' | 'mono' | 'serif'
  fontSize?: number;         // 13 | 15 | 17 | 19
  showWeatherWidget?: boolean;
}
```
