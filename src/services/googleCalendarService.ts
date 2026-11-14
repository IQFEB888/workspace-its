import { CalendarEventCategory, CalendarEventItem } from '../types';

export interface GoogleCalendarRawEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
}

function inferCategoryFromSummary(summary: string, description = ''): CalendarEventCategory {
  const combined = `${summary} ${description}`.toLowerCase();
  if (/\b(esame|verifica|test|parziale|orale|scritto)\b/.test(combined)) return 'exam';
  if (/\b(compito|consegna|scadenza|esercizi|homework|progetto|relazione)\b/.test(combined)) return 'homework';
  if (/\b(studio|ripasso|ripetizione|esercitazione)\b/.test(combined)) return 'study';
  return 'lecture';
}

export const CATEGORY_META: Record<
  CalendarEventCategory,
  { label: string; icon: string; color: string; badgeBg: string }
> = {
  lecture: {
    label: 'Lezione',
    icon: '🎓',
    color: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.16)'
  },
  homework: {
    label: 'Compito / Scadenza',
    icon: '📝',
    color: '#facc15',
    badgeBg: 'rgba(250, 204, 21, 0.16)'
  },
  study: {
    label: 'Sessione Studio',
    icon: '📖',
    color: '#4ade80',
    badgeBg: 'rgba(74, 222, 128, 0.16)'
  },
  exam: {
    label: 'Esame / Verifica',
    icon: '🏆',
    color: '#f43f5e',
    badgeBg: 'rgba(244, 63, 94, 0.18)'
  }
};

/**
 * Fetches Google Calendar events from the user's primary calendar within a date window.
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
  defaultSubject = 'Generale'
): Promise<CalendarEventItem[]> {
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Errore Google Calendar (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const items: GoogleCalendarRawEvent[] = Array.isArray(data.items) ? data.items : [];

  return items.map(item => {
    const startRaw = item.start?.dateTime || item.start?.date || '';
    const endRaw = item.end?.dateTime || item.end?.date || '';

    let dateStr = '';
    let startTime = '09:00';
    let endTime = '10:00';

    if (startRaw.includes('T')) {
      const dt = new Date(startRaw);
      if (!isNaN(dt.getTime())) {
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        dateStr = `${yyyy}-${mm}-${dd}`;
        startTime = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      }
    } else if (startRaw) {
      dateStr = startRaw.slice(0, 10);
      startTime = '09:00';
    }

    if (endRaw.includes('T')) {
      const dtEnd = new Date(endRaw);
      if (!isNaN(dtEnd.getTime())) {
        endTime = `${String(dtEnd.getHours()).padStart(2, '0')}:${String(dtEnd.getMinutes()).padStart(2, '0')}`;
      }
    } else {
      endTime = '10:00';
    }

    const title = item.summary || 'Evento senza titolo';
    const description = item.description || '';
    const category = inferCategoryFromSummary(title, description);

    return {
      id: `gcal_${item.id}`,
      googleEventId: item.id,
      title,
      date: dateStr || new Date().toISOString().slice(0, 10),
      startTime,
      endTime,
      category,
      subject: defaultSubject,
      description,
      completed: false,
      color: CATEGORY_META[category].color
    };
  });
}

/**
 * Pushes a local event to the user's primary Google Calendar and returns the created Google event ID.
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: CalendarEventItem
): Promise<string> {
  const startIso = new Date(`${event.date}T${event.startTime || '09:00'}:00`).toISOString();
  const endIso = new Date(`${event.date}T${event.endTime || '10:00'}:00`).toISOString();
  const catMeta = CATEGORY_META[event.category] || CATEGORY_META.lecture;

  const payload = {
    summary: `${catMeta.icon} [${event.subject}] ${event.title}`,
    description: event.description || `Categoria: ${catMeta.label} • Materia: ${event.subject} (Creato da Workspace ITS)`,
    start: {
      dateTime: startIso
    },
    end: {
      dateTime: endIso
    }
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Impossibile creare evento su Google Calendar (${res.status}): ${errText}`);
  }

  const created = await res.json();
  return created.id as string;
}

/**
 * Deletes an event from the user's primary Google Calendar.
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  googleEventId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Impossibile eliminare evento da Google Calendar (${res.status})`);
  }
}
