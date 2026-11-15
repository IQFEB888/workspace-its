import React, { useState, useMemo } from 'react';
import { CalendarEventCategory, CalendarEventItem, SubjectItem } from '../types';
import { CATEGORY_META } from '../services/googleCalendarService';

interface StudyCalendarPanelProps {
  events: CalendarEventItem[];
  subjects: SubjectItem[];
  activeSubject: string;
  isSyncingGoogle?: boolean;
  isGoogleCalendarConnected?: boolean;
  googleCalendarEmail?: string | null;
  calendarApiEnableUrl?: string | null;
  onDismissApiEnableUrl?: () => void;
  onAddEvent: (
    event: Omit<CalendarEventItem, 'id'>,
    alsoPushToGoogle: boolean
  ) => Promise<void> | void;
  onToggleComplete: (eventId: string) => void;
  onDeleteEvent: (event: CalendarEventItem) => void;
  onSyncGoogleCalendar: () => Promise<void> | void;
  onSwitchGoogleCalendarAccount?: () => Promise<void> | void;
  onImportIcsFile?: (icsContent: string, fileName: string) => Promise<void> | void;
  onOpenFullCalendar?: () => void;
  onBackToNotes?: () => void;
  compact?: boolean;
}

const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTHS_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre'
];

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatReadableDateIt(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Oggi';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return dateStr;
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  return `${dayNames[d.getDay()]} ${Number(parts[2])} ${MONTHS_IT[d.getMonth()]?.slice(0, 3) || ''}`;
}

export const StudyCalendarPanel: React.FC<StudyCalendarPanelProps> = ({
  events,
  subjects,
  activeSubject,
  isSyncingGoogle = false,
  isGoogleCalendarConnected = false,
  googleCalendarEmail = null,
  calendarApiEnableUrl = null,
  onDismissApiEnableUrl,
  onAddEvent,
  onToggleComplete,
  onDeleteEvent,
  onSyncGoogleCalendar,
  onSwitchGoogleCalendarAccount,
  onImportIcsFile,
  onOpenFullCalendar,
  onBackToNotes,
  compact = false
}) => {
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const icsInputRef = React.useRef<HTMLInputElement | null>(null);
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>(compact ? 'agenda' : 'month');
  const [categoryFilter, setCategoryFilter] = useState<CalendarEventCategory | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSchoolSyncGuide, setShowSchoolSyncGuide] = useState(false);

  // New event form state
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<CalendarEventCategory>('lecture');
  const [newSubject, setNewSubject] = useState<string>(activeSubject || 'Database');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('11:00');
  const [newDesc, setNewDesc] = useState('');
  const [pushToGoogle, setPushToGoogle] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (categoryFilter !== 'all' && ev.category !== categoryFilter) return false;
      return true;
    });
  }, [events, categoryFilter]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEventItem[]> = {};
    for (const ev of filteredEvents) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    for (const k in map) {
      map[k].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [filteredEvents]);

  // Build 42-day calendar grid (starting Monday)
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - startWeekday);

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const dStr = toDateStr(d);
      days.push({
        dateStr: dStr,
        dayNum: d.getDate(),
        isCurrentMonth: d.getMonth() === month,
        isToday: dStr === todayStr
      });
    }
    return days;
  }, [currentMonthDate, todayStr]);

  const selectedDayEvents = useMemo(() => {
    return eventsByDate[selectedDate] || [];
  }, [eventsByDate, selectedDate]);

  const upcomingEvents = useMemo(() => {
    return [...filteredEvents]
      .filter(ev => ev.date >= todayStr)
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
      .slice(0, 20);
  }, [filteredEvents, todayStr]);

  const stats = useMemo(() => {
    const pendingHomework = events.filter(
      e => (e.category === 'homework' || e.category === 'study') && !e.completed
    ).length;
    const upcomingExams = events.filter(e => e.category === 'exam' && e.date >= todayStr).length;
    const todayCount = (eventsByDate[todayStr] || []).length;
    return { pendingHomework, upcomingExams, todayCount };
  }, [events, eventsByDate, todayStr]);

  const handlePrevMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(toDateStr(now));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const catMeta = CATEGORY_META[newCategory] || CATEGORY_META.lecture;
    await onAddEvent(
      {
        title: newTitle.trim(),
        date: selectedDate,
        startTime: newStartTime,
        endTime: newEndTime,
        category: newCategory,
        subject: newSubject || activeSubject || 'Database',
        description: newDesc.trim(),
        completed: false,
        color: catMeta.color,
        createdAt: new Date().toISOString()
      },
      pushToGoogle && isGoogleCalendarConnected
    );
    setNewTitle('');
    setNewDesc('');
    setShowAddForm(false);
  };

  return (
    <div className={`study-calendar-root ${compact ? 'is-compact' : 'is-full'}`}>
      {/* Top Toolbar */}
      <div className="study-cal-toolbar">
        <div className="study-cal-nav-group">
          {!compact && onBackToNotes && (
            <button
              type="button"
              className="study-cal-back-btn"
              onClick={onBackToNotes}
              title="Torna agli Appunti"
            >
              ← Appunti
            </button>
          )}
          <div className="study-cal-month-switcher">
            <button
              type="button"
              className="study-cal-icon-btn"
              onClick={handlePrevMonth}
              aria-label="Mese precedente"
              title="Mese precedente"
            >
              ‹
            </button>
            <h3 className="study-cal-month-title">
              {MONTHS_IT[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
            </h3>
            <button
              type="button"
              className="study-cal-icon-btn"
              onClick={handleNextMonth}
              aria-label="Mese successivo"
              title="Mese successivo"
            >
              ›
            </button>
          </div>
          <button type="button" className="study-cal-ghost-btn" onClick={handleGoToday}>
            Oggi
          </button>
        </div>

        {!compact && (
          <div className="study-cal-metrics">
            <span className="study-cal-metric-item">
              Oggi <strong>{stats.todayCount}</strong>
            </span>
            <span className="study-cal-metric-sep">·</span>
            <span className="study-cal-metric-item">
              Compiti <strong>{stats.pendingHomework}</strong>
            </span>
            <span className="study-cal-metric-sep">·</span>
            <span className="study-cal-metric-item">
              Esami <strong>{stats.upcomingExams}</strong>
            </span>
          </div>
        )}

        <div className="study-cal-right-controls">
          <div className="study-cal-segmented">
            <button
              type="button"
              className={`study-cal-seg-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              Griglia Mese
            </button>
            <button
              type="button"
              className={`study-cal-seg-btn ${viewMode === 'agenda' ? 'active' : ''}`}
              onClick={() => setViewMode('agenda')}
            >
              Lista Agenda
            </button>
          </div>

          <button
            type="button"
            className={`study-cal-sync-btn ${isGoogleCalendarConnected ? 'is-linked' : ''}`}
            onClick={onSyncGoogleCalendar}
            disabled={isSyncingGoogle}
            title={
              isGoogleCalendarConnected
                ? `Sincronizza eventi da ${googleCalendarEmail || 'Google Calendar Personale'} (senza cambiare l'account dell'app)`
                : 'Collega il tuo Google Calendar personale per leggere gli eventi senza scollegare il tuo account principale'
            }
          >
            {isSyncingGoogle
              ? 'Sincronizzazione...'
              : isGoogleCalendarConnected
              ? `↻ Sync (${googleCalendarEmail ? googleCalendarEmail.split('@')[0] : 'Google'})`
              : '🔗 Collega Calendar Personale'}
          </button>

          {onSwitchGoogleCalendarAccount && (
            <button
              type="button"
              className="study-cal-ghost-btn"
              onClick={onSwitchGoogleCalendarAccount}
              disabled={isSyncingGoogle}
              title="Scegli un altro account Google (es. il tuo Gmail personale) solo per leggere gli eventi di Google Calendar"
            >
              👤 {isGoogleCalendarConnected ? 'Cambia Account' : 'Scegli Account'}
            </button>
          )}

          {onImportIcsFile && (
            <>
              <input
                ref={icsInputRef}
                type="file"
                accept=".ics,text/calendar"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const content = String(ev.target?.result || '');
                    if (content) {
                      onImportIcsFile(content, file.name);
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="study-cal-ghost-btn"
                onClick={() => icsInputRef.current?.click()}
                title="Importa un file .ics (iCal) esportato dal calendario della scuola o dal portale ITS"
              >
                📥 Importa .ics
              </button>
            </>
          )}

          <button
            type="button"
            className="study-cal-ghost-btn"
            onClick={() => setShowSchoolSyncGuide(prev => !prev)}
            title="Come sincronizzare automaticamente tutti gli eventi del Google Calendar scolastico sul tuo account Google personale"
          >
            🎓 {showSchoolSyncGuide ? 'Chiudi Guida Scuola' : 'Sincronizza Scuola → Personale'}
          </button>

          {compact && onOpenFullCalendar && (
            <button
              type="button"
              className="study-cal-ghost-btn"
              onClick={onOpenFullCalendar}
              title="Apri vista calendario a schermo intero"
            >
              ↗ Espandi
            </button>
          )}

          <button
            type="button"
            className="study-cal-primary-btn"
            onClick={() => setShowAddForm(prev => !prev)}
          >
            {showAddForm ? '✕ Chiudi' : '+ Nuovo Impegno'}
          </button>
        </div>
      </div>

      {/* Category Filter Strip + Connected Personal Calendar Account Info */}
      <div className="study-cal-filter-row">
        <button
          type="button"
          className={`study-cal-filter-chip ${categoryFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('all')}
        >
          Tutti ({events.length})
        </button>
        {(Object.keys(CATEGORY_META) as CalendarEventCategory[]).map(catKey => {
          const meta = CATEGORY_META[catKey];
          const count = events.filter(e => e.category === catKey).length;
          return (
            <button
              key={catKey}
              type="button"
              className={`study-cal-filter-chip ${categoryFilter === catKey ? 'active' : ''}`}
              onClick={() => setCategoryFilter(catKey)}
            >
              <span
                className="study-cal-cat-dot"
                style={{ backgroundColor: meta.color }}
              />
              {meta.label} ({count})
            </button>
          );
        })}

        {!compact && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.72rem',
              color: isGoogleCalendarConnected ? '#6ee7b7' : 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isGoogleCalendarConnected
              ? `📅 Account Calendar: ${googleCalendarEmail || 'Personale collegato'} (legge anche calendari condivisi/scuola)`
              : '💡 Clicca "🎓 Sincronizza Scuola → Personale" per unire il calendario scolastico al tuo Gmail personale'}
          </span>
        )}
      </div>

      {/* Step-by-Step Guide: How to Sync School Google Calendar to Personal Gmail */}
      {showSchoolSyncGuide && (
        <div
          className="toolbar-slide-down"
          style={{
            padding: '12px 14px',
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '10px',
            fontSize: '0.76rem',
            color: '#e2e8f0',
            lineHeight: 1.55
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>
              🎓 Come sincronizzare il Google Calendar Scolastico col tuo Gmail Personale (in 1 minuto)
            </strong>
            <button
              type="button"
              className="study-cal-ghost-btn sm"
              onClick={() => setShowSchoolSyncGuide(false)}
            >
              ✕ Chiudi
            </button>
          </div>
          <p style={{ margin: '0 0 8px 0', color: '#cbd5e1' }}>
            Workspace ITS legge automaticamente sia il calendario principale sia <strong>tutti i calendari secondari/condivisi</strong> presenti nel tuo Google Calendar personale. Ti basta collegare il calendario della scuola al tuo Gmail personale con uno di questi 2 metodi:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
            <div style={{ background: 'rgba(0,0,0,0.28)', padding: '9px 11px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontWeight: 700, color: '#6ee7b7', marginBottom: '4px' }}>
                ✅ Metodo 1: Condivisione diretta (Consigliato & Live)
              </div>
              <ol style={{ margin: 0, paddingLeft: '16px', color: '#cbd5e1' }}>
                <li>Apri <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>calendar.google.com</a> entrando con l&apos;<strong>account della scuola</strong>.</li>
                <li>A sinistra sotto <em>&quot;I miei calendari&quot;</em>, passa il mouse sul tuo nome → clicca i <strong>3 puntini ⋮</strong> → <strong>Impostazioni e condivisione</strong>.</li>
                <li>Scorri fino a <strong>&quot;Condividi con persone specifiche&quot;</strong>, clicca <strong>&quot;+ Aggiungi persone e gruppi&quot;</strong> e inserisci la tua email <strong>@gmail.com personale</strong>.</li>
                <li>Apri la tua Gmail personale, clicca <strong>&quot;Aggiungi questo calendario&quot;</strong> nell&apos;email ricevuta e poi premi <strong>🔗 Collega Calendar Personale / ↻ Sync</strong> qui sopra!</li>
              </ol>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.28)', padding: '9px 11px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontWeight: 700, color: '#fcd34d', marginBottom: '4px' }}>
                🔑 Metodo 2: Link Segreto iCal o Esporta .ics (Se la scuola blocca la condivisione)
              </div>
              <ol style={{ margin: 0, paddingLeft: '16px', color: '#cbd5e1' }}>
                <li>Sempre in <strong>Impostazioni e condivisione</strong> del calendario scolastico, scorri fino in fondo a <strong>&quot;Integra calendario&quot;</strong>.</li>
                <li>Copia l&apos;<strong>&quot;Indirizzo segreto in formato iCal&quot;</strong> (oppure clicca <strong>&quot;Esporta calendario&quot;</strong> per scaricare il file <code>.ics</code>).</li>
                <li>Nel tuo Google Calendar <strong>personale</strong>, clicca il <strong>+</strong> vicino ad <em>&quot;Altri calendari&quot;</em> → <strong>&quot;Da URL&quot;</strong> e incolla il link (oppure carica il file <code>.ics</code> qui con <strong>📥 Importa .ics</strong>).</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Activation Banner if Google Calendar API needs to be enabled on project 455460787207 */}
      {calendarApiEnableUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            padding: '10px 14px',
            background: 'rgba(245, 158, 11, 0.14)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            borderRadius: '10px',
            fontSize: '0.78rem',
            color: '#fef3c7'
          }}
        >
          <span>
            ⚠️ <strong>Attivazione richiesta una sola volta:</strong> l&apos;API Google Calendar non è ancora attiva sul progetto Firebase <code>workspace-its-10786</code> (455460787207). Clicca il pulsante a destra, premi il tasto blu <strong>&quot;Abilita / Enable&quot;</strong> nella pagina Google Cloud e poi riprova!
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a
              href={calendarApiEnableUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="study-cal-primary-btn"
              style={{
                textDecoration: 'none',
                background: '#f59e0b',
                color: '#09090b',
                fontWeight: 700
              }}
            >
              ⚡ Abilita Google Calendar API ↗
            </a>
            <button
              type="button"
              className="study-cal-ghost-btn sm"
              onClick={onSyncGoogleCalendar}
            >
              ↻ Ho abilitato, riprova
            </button>
            {onDismissApiEnableUrl && (
              <button
                type="button"
                className="study-cal-ghost-btn sm"
                onClick={onDismissApiEnableUrl}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Add Event / Homework Form */}
      {showAddForm && (
        <form className="study-cal-form" onSubmit={handleCreateSubmit}>
          <div className="study-cal-form-header">
            <span className="study-cal-form-title">
              Pianifica lezione, compito o esame per il{' '}
              <strong>{formatReadableDateIt(selectedDate, todayStr)}</strong>
            </span>
            <input
              type="date"
              className="study-cal-field date-field"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>

          <div className="study-cal-form-row">
            <input
              type="text"
              className="study-cal-field flex-2"
              placeholder="Titolo impegno (es. Lezione Database SQL, Consegna Progetto, Esame...)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              required
              autoFocus
            />

            <select
              className="study-cal-field"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as CalendarEventCategory)}
            >
              <option value="lecture">Lezione</option>
              <option value="homework">Compito / Scadenza</option>
              <option value="study">Sessione Studio</option>
              <option value="exam">Esame / Verifica</option>
            </select>

            <select
              className="study-cal-field"
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
            >
              {subjects.map(s => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
              <option value="Generale">Generale</option>
            </select>

            <div className="study-cal-time-group">
              <input
                type="time"
                className="study-cal-field time-field"
                value={newStartTime}
                onChange={e => setNewStartTime(e.target.value)}
              />
              <span className="study-cal-time-sep">–</span>
              <input
                type="time"
                className="study-cal-field time-field"
                value={newEndTime}
                onChange={e => setNewEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="study-cal-form-footer">
            <input
              type="text"
              className="study-cal-field flex-1"
              placeholder="Note aggiuntive, argomenti da ripassare o aula (opzionale)..."
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
            {isGoogleCalendarConnected && (
              <label className="study-cal-checkbox-label">
                <input
                  type="checkbox"
                  checked={pushToGoogle}
                  onChange={e => setPushToGoogle(e.target.checked)}
                />
                <span>Sincronizza su Google Calendar</span>
              </label>
            )}
            <button type="submit" className="study-cal-primary-btn">
              Salva Impegno
            </button>
          </div>
        </form>
      )}

      {/* Workspace Split Layout: Month Grid + Selected Day / Upcoming Sidebar */}
      <div className={`study-cal-workspace ${viewMode === 'agenda' || compact ? 'is-single-col' : ''}`}>
        {viewMode === 'month' && (
          <div className="study-cal-grid-wrap">
            <div className="study-cal-weekdays">
              {WEEKDAYS_SHORT.map(w => (
                <div key={w} className="study-cal-weekday-label">
                  {w}
                </div>
              ))}
            </div>

            <div className="study-cal-grid">
              {calendarDays.map(day => {
                const dayEvs = eventsByDate[day.dateStr] || [];
                const isSelected = day.dateStr === selectedDate;
                return (
                  <div
                    key={day.dateStr}
                    className={`study-cal-day ${!day.isCurrentMonth ? 'other-month' : ''} ${
                      day.isToday ? 'is-today' : ''
                    } ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedDate(day.dateStr)}
                    onDoubleClick={() => {
                      setSelectedDate(day.dateStr);
                      setShowAddForm(true);
                    }}
                  >
                    <div className="study-cal-day-top">
                      <span className="study-cal-day-num">{day.dayNum}</span>
                      {dayEvs.length > 0 && (
                        <span className="study-cal-day-count">{dayEvs.length}</span>
                      )}
                    </div>

                    <div className="study-cal-day-events">
                      {dayEvs.slice(0, compact ? 2 : 3).map(ev => {
                        const meta = CATEGORY_META[ev.category] || CATEGORY_META.lecture;
                        return (
                          <div
                            key={ev.id}
                            className={`study-cal-day-pill ${ev.completed ? 'is-done' : ''}`}
                            style={{
                              backgroundColor: meta.badgeBg,
                              borderColor: `${meta.color}44`,
                              color: '#f8fafc'
                            }}
                            title={`${ev.startTime} · ${ev.title} (${ev.subject})`}
                          >
                            <span
                              className="study-cal-cat-dot"
                              style={{ backgroundColor: meta.color }}
                            />
                            <span className="study-cal-pill-time">{ev.startTime}</span>
                            <span className="study-cal-pill-text">{ev.title}</span>
                          </div>
                        );
                      })}
                      {dayEvs.length > (compact ? 2 : 3) && (
                        <div className="study-cal-day-more">
                          +{dayEvs.length - (compact ? 2 : 3)} altri
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Right / Agenda Column */}
        <div className="study-cal-side-panel">
          {/* Selected Date Schedule */}
          <div className="study-cal-section-box">
            <div className="study-cal-section-head">
              <div className="study-cal-section-title">
                Programma · <strong>{formatReadableDateIt(selectedDate, todayStr)}</strong>
              </div>
              <button
                type="button"
                className="study-cal-ghost-btn sm"
                onClick={() => setShowAddForm(true)}
              >
                + Aggiungi
              </button>
            </div>

            {selectedDayEvents.length === 0 ? (
              <div className="study-cal-empty-state">
                Nessuna lezione o scadenza per questa giornata. Doppio clic su una data o premi{' '}
                <strong>+ Aggiungi</strong> per pianificare.
              </div>
            ) : (
              <div className="study-cal-agenda-list">
                {selectedDayEvents.map(ev => {
                  const meta = CATEGORY_META[ev.category] || CATEGORY_META.lecture;
                  return (
                    <div
                      key={ev.id}
                      className={`study-cal-event-card ${ev.completed ? 'is-done' : ''}`}
                    >
                      <div className="study-cal-event-main">
                        <button
                          type="button"
                          className={`study-cal-check-btn ${ev.completed ? 'checked' : ''}`}
                          onClick={() => onToggleComplete(ev.id)}
                          aria-label={`Segna ${ev.title} come completato`}
                          title="Segna come completato"
                        >
                          {ev.completed ? '✓' : ''}
                        </button>
                        <div className="study-cal-event-info">
                          <div className="study-cal-event-title-row">
                            <span
                              className="study-cal-cat-dot"
                              style={{ backgroundColor: meta.color }}
                            />
                            <span className="study-cal-event-name">{ev.title}</span>
                          </div>
                          <div className="study-cal-event-submeta">
                            <span className="tabular-nums">
                              {ev.startTime} – {ev.endTime}
                            </span>
                            <span>·</span>
                            <span>{ev.subject}</span>
                            <span>·</span>
                            <span style={{ color: meta.color }}>{meta.label}</span>
                            {ev.googleEventId && (
                              <>
                                <span>·</span>
                                <span>Google Sync</span>
                              </>
                            )}
                          </div>
                          {ev.description && (
                            <div className="study-cal-event-note">{ev.description}</div>
                          )}
                        </div>
                      </div>

                      <div className="study-cal-event-actions">
                        {confirmDeleteId === ev.id ? (
                          <>
                            <button
                              type="button"
                              className="study-cal-del-confirm"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                onDeleteEvent(ev);
                              }}
                            >
                              Elimina
                            </button>
                            <button
                              type="button"
                              className="study-cal-ghost-btn sm"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Annulla
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="study-cal-del-icon"
                            onClick={() => setConfirmDeleteId(ev.id)}
                            aria-label={`Elimina ${ev.title}`}
                            title="Rimuovi impegno"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Study & Deadlines */}
          <div className="study-cal-section-box">
            <div className="study-cal-section-head">
              <div className="study-cal-section-title">Prossime Scadenze &amp; Lezioni</div>
              <span className="study-cal-muted-count">{upcomingEvents.length} in agenda</span>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="study-cal-empty-state">
                Nessun impegno futuro programmato.
              </div>
            ) : (
              <div className="study-cal-agenda-list">
                {upcomingEvents.map(ev => {
                  const meta = CATEGORY_META[ev.category] || CATEGORY_META.lecture;
                  return (
                    <div
                      key={ev.id}
                      className={`study-cal-event-card is-compact-row ${ev.completed ? 'is-done' : ''}`}
                      onClick={() => setSelectedDate(ev.date)}
                    >
                      <div className="study-cal-event-main">
                        <button
                          type="button"
                          className={`study-cal-check-btn ${ev.completed ? 'checked' : ''}`}
                          onClick={e => {
                            e.stopPropagation();
                            onToggleComplete(ev.id);
                          }}
                          aria-label={`Completa ${ev.title}`}
                        >
                          {ev.completed ? '✓' : ''}
                        </button>
                        <div className="study-cal-event-info">
                          <div className="study-cal-event-title-row">
                            <span
                              className="study-cal-cat-dot"
                              style={{ backgroundColor: meta.color }}
                            />
                            <span className="study-cal-event-name">{ev.title}</span>
                          </div>
                          <div className="study-cal-event-submeta">
                            <span className="tabular-nums">
                              {formatReadableDateIt(ev.date, todayStr)} · {ev.startTime}
                            </span>
                            <span>·</span>
                            <span>{ev.subject}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
