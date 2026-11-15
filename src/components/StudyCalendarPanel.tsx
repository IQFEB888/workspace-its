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
              ? `📅 Account Calendar: ${googleCalendarEmail || 'Personale collegato'}`
              : '💡 Puoi collegare il tuo Gmail personale solo per il Calendario oppure importare un file .ics della scuola'}
          </span>
        )}
      </div>

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
