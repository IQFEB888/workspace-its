import React, { useState, useMemo } from 'react';
import { CalendarEventCategory, CalendarEventItem, SubjectItem } from '../types';
import { CATEGORY_META } from '../services/googleCalendarService';

interface StudyCalendarPanelProps {
  events: CalendarEventItem[];
  subjects: SubjectItem[];
  activeSubject: string;
  isSyncingGoogle?: boolean;
  isGoogleCalendarConnected?: boolean;
  onAddEvent: (
    event: Omit<CalendarEventItem, 'id'>,
    alsoPushToGoogle: boolean
  ) => Promise<void> | void;
  onToggleComplete: (eventId: string) => void;
  onDeleteEvent: (event: CalendarEventItem) => void;
  onSyncGoogleCalendar: () => Promise<void> | void;
  onOpenFullCalendar?: () => void;
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

export const StudyCalendarPanel: React.FC<StudyCalendarPanelProps> = ({
  events,
  subjects,
  activeSubject,
  isSyncingGoogle = false,
  isGoogleCalendarConnected = false,
  onAddEvent,
  onToggleComplete,
  onDeleteEvent,
  onSyncGoogleCalendar,
  compact = false
}) => {
  const todayStr = useMemo(() => toDateStr(new Date()), []);
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
    // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
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
      .slice(0, 25);
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
    <div className={`study-calendar-root ${compact ? 'is-compact-widget' : 'is-full-panel'}`}>
      {/* Header Controls */}
      <div className="study-cal-header">
        <div className="study-cal-title-group">
          <div className="study-cal-month-nav">
            <button type="button" className="study-cal-nav-btn" onClick={handlePrevMonth} title="Mese precedente">
              ◀
            </button>
            <span className="study-cal-month-label">
              {MONTHS_IT[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
            </span>
            <button type="button" className="study-cal-nav-btn" onClick={handleNextMonth} title="Mese successivo">
              ▶
            </button>
            <button type="button" className="study-cal-today-btn" onClick={handleGoToday}>
              Oggi
            </button>
          </div>

          {!compact && (
            <div className="study-cal-kpi-pills">
              <span className="study-cal-kpi-pill">📅 Oggi: <b>{stats.todayCount}</b></span>
              <span className="study-cal-kpi-pill warn">📝 Da fare: <b>{stats.pendingHomework}</b></span>
              <span className="study-cal-kpi-pill danger">🏆 Esami: <b>{stats.upcomingExams}</b></span>
            </div>
          )}
        </div>

        <div className="study-cal-actions-group">
          <div className="study-cal-view-switch">
            <button
              type="button"
              className={`study-cal-switch-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              📅 Mese
            </button>
            <button
              type="button"
              className={`study-cal-switch-btn ${viewMode === 'agenda' ? 'active' : ''}`}
              onClick={() => setViewMode('agenda')}
            >
              📋 Agenda
            </button>
          </div>

          <button
            type="button"
            className={`study-cal-gcal-btn ${isGoogleCalendarConnected ? 'connected' : ''}`}
            onClick={onSyncGoogleCalendar}
            disabled={isSyncingGoogle}
            title="Sincronizza lezioni, esami e scadenze con il tuo Google Calendar"
          >
            {isSyncingGoogle
              ? '⏳ Sincronizzazione...'
              : isGoogleCalendarConnected
              ? '🔄 Sync Google Calendar'
              : '🔗 Collega Google Calendar'}
          </button>

          <button
            type="button"
            className="study-cal-add-btn"
            onClick={() => setShowAddForm(prev => !prev)}
          >
            {showAddForm ? '✕ Chiudi' : '+ Nuovo Impegno'}
          </button>
        </div>
      </div>

      {/* Category Filter Strip */}
      <div className="study-cal-filter-bar">
        <button
          type="button"
          className={`study-cal-filter-chip ${categoryFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('all')}
        >
          Tutti ({events.length})
        </button>
        {(Object.keys(CATEGORY_META) as CalendarEventCategory[]).map(catKey => {
          const meta = CATEGORY_META[catKey];
          return (
            <button
              key={catKey}
              type="button"
              className={`study-cal-filter-chip ${categoryFilter === catKey ? 'active' : ''}`}
              onClick={() => setCategoryFilter(catKey)}
            >
              {meta.icon} {meta.label}
            </button>
          );
        })}
      </div>

      {/* Inline Add Event / Task Form */}
      {showAddForm && (
        <form className="study-cal-add-form" onSubmit={handleCreateSubmit}>
          <div className="study-cal-form-top">
            <span className="study-cal-form-heading">
              ➕ Nuovo Impegno per il <b>{selectedDate}</b>
            </span>
            <input
              type="date"
              className="study-cal-input date-input"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>

          <div className="study-cal-form-grid">
            <input
              type="text"
              className="study-cal-input title-input"
              placeholder="Titolo (es. Lezione SQL Join, Compito Normalizzazione, Studio Esame...)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              required
              autoFocus
            />

            <select
              className="study-cal-input"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as CalendarEventCategory)}
            >
              <option value="lecture">🎓 Lezione</option>
              <option value="homework">📝 Compito / Scadenza</option>
              <option value="study">📖 Sessione Studio</option>
              <option value="exam">🏆 Esame / Verifica</option>
            </select>

            <select
              className="study-cal-input"
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
            >
              {subjects.map(s => (
                <option key={s.id} value={s.name}>
                  📚 {s.name}
                </option>
              ))}
              <option value="Generale">📚 Generale</option>
            </select>

            <div className="study-cal-time-pair">
              <input
                type="time"
                className="study-cal-input"
                value={newStartTime}
                onChange={e => setNewStartTime(e.target.value)}
              />
              <span>→</span>
              <input
                type="time"
                className="study-cal-input"
                value={newEndTime}
                onChange={e => setNewEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="study-cal-form-bottom">
            <input
              type="text"
              className="study-cal-input desc-input"
              placeholder="Note / Capitoli da studiare / Link aula (opzionale)..."
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
            {isGoogleCalendarConnected && (
              <label className="study-cal-gcal-check">
                <input
                  type="checkbox"
                  checked={pushToGoogle}
                  onChange={e => setPushToGoogle(e.target.checked)}
                />
                <span>Salva anche su Google Calendar</span>
              </label>
            )}
            <button type="submit" className="study-cal-submit-btn">
              💾 Salva in Calendario
            </button>
          </div>
        </form>
      )}

      {/* Main Content Area: Month Grid + Day Sidebar OR Agenda List */}
      <div className={`study-cal-body ${viewMode === 'agenda' ? 'agenda-only' : ''}`}>
        {viewMode === 'month' && (
          <div className="study-cal-grid-wrap">
            <div className="study-cal-weekdays">
              {WEEKDAYS_SHORT.map(w => (
                <div key={w} className="study-cal-weekday-cell">
                  {w}
                </div>
              ))}
            </div>
            <div className="study-cal-days-grid">
              {calendarDays.map(day => {
                const dayEvs = eventsByDate[day.dateStr] || [];
                const isSelected = day.dateStr === selectedDate;
                return (
                  <div
                    key={day.dateStr}
                    className={`study-cal-day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${
                      day.isToday ? 'is-today' : ''
                    } ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedDate(day.dateStr)}
                    onDoubleClick={() => {
                      setSelectedDate(day.dateStr);
                      setShowAddForm(true);
                    }}
                  >
                    <div className="study-cal-day-top">
                      <span className="study-cal-day-number">{day.dayNum}</span>
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
                            className={`study-cal-event-pill ${ev.completed ? 'is-done' : ''}`}
                            style={{
                              borderLeftColor: meta.color,
                              background: meta.badgeBg
                            }}
                            title={`${ev.startTime} - ${ev.title} (${ev.subject})`}
                          >
                            <span className="ev-pill-time">{ev.startTime}</span>
                            <span className="ev-pill-title">{ev.title}</span>
                          </div>
                        );
                      })}
                      {dayEvs.length > (compact ? 2 : 3) && (
                        <div className="study-cal-more-pill">
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

        {/* Right / Bottom Day Detail & Upcoming Study Plan */}
        <div className="study-cal-sidebar">
          <div className="study-cal-sidebar-section">
            <div className="study-cal-sidebar-header">
              <span>
                📌 Programma del <b>{selectedDate === todayStr ? 'Oggi' : selectedDate}</b>
              </span>
              <button
                type="button"
                className="study-cal-mini-add"
                onClick={() => setShowAddForm(true)}
              >
                + Aggiungi
              </button>
            </div>

            {selectedDayEvents.length === 0 ? (
              <div className="study-cal-empty-day">
                Nessuna lezione o compito per questa data. Clicca <b>+ Aggiungi</b> o fai doppio clic su un giorno.
              </div>
            ) : (
              <div className="study-cal-event-list">
                {selectedDayEvents.map(ev => {
                  const meta = CATEGORY_META[ev.category] || CATEGORY_META.lecture;
                  return (
                    <div
                      key={ev.id}
                      className={`study-cal-event-card ${ev.completed ? 'is-done' : ''}`}
                      style={{ borderLeftColor: meta.color }}
                    >
                      <div className="study-cal-event-card-top">
                        <label className="study-cal-check-wrap">
                          <input
                            type="checkbox"
                            checked={!!ev.completed}
                            onChange={() => onToggleComplete(ev.id)}
                          />
                          <span className="study-cal-event-title">
                            {meta.icon} {ev.title}
                          </span>
                        </label>
                        {confirmDeleteId === ev.id ? (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="study-cal-del-btn"
                              style={{ color: '#f43f5e', fontWeight: 700, fontSize: '0.68rem' }}
                              onClick={() => {
                                setConfirmDeleteId(null);
                                onDeleteEvent(ev);
                              }}
                              title="Conferma eliminazione"
                            >
                              Conferma
                            </button>
                            <button
                              type="button"
                              className="study-cal-del-btn"
                              style={{ fontSize: '0.68rem' }}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="study-cal-del-btn"
                            onClick={() => setConfirmDeleteId(ev.id)}
                            title="Elimina impegno"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                      <div className="study-cal-event-meta">
                        <span>🕒 {ev.startTime} - {ev.endTime}</span>
                        <span className="study-cal-sub-badge">📚 {ev.subject}</span>
                        {ev.googleEventId && (
                          <span className="study-cal-gcal-badge" title="Sincronizzato con Google Calendar">
                            ☁️ GCal
                          </span>
                        )}
                      </div>
                      {ev.description && (
                        <div className="study-cal-event-desc">{ev.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="study-cal-sidebar-section">
            <div className="study-cal-sidebar-header">
              <span>🚀 Prossime Lezioni, Compiti & Esami</span>
            </div>
            {upcomingEvents.length === 0 ? (
              <div className="study-cal-empty-day">
                Nessun impegno futuro in programma.
              </div>
            ) : (
              <div className="study-cal-event-list">
                {upcomingEvents.map(ev => {
                  const meta = CATEGORY_META[ev.category] || CATEGORY_META.lecture;
                  return (
                    <div
                      key={ev.id}
                      className={`study-cal-event-card compact-card ${ev.completed ? 'is-done' : ''}`}
                      style={{ borderLeftColor: meta.color }}
                      onClick={() => setSelectedDate(ev.date)}
                    >
                      <div className="study-cal-event-card-top">
                        <label
                          className="study-cal-check-wrap"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={!!ev.completed}
                            onChange={() => onToggleComplete(ev.id)}
                          />
                          <span className="study-cal-event-title">
                            {meta.icon} {ev.title}
                          </span>
                        </label>
                        <span className="study-cal-date-chip">{ev.date.slice(5)}</span>
                      </div>
                      <div className="study-cal-event-meta">
                        <span>{ev.startTime}</span>
                        <span className="study-cal-sub-badge">{ev.subject}</span>
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
