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
 * Fetches Google Calendar events from the user's primary calendar AND any shared/subscribed
 * secondary calendars (e.g. a school calendar shared with the user's personal Gmail) within a date window.
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

  // Discover all calendars in the connected personal account (primary + any shared school calendars)
  let calendarIds: string[] = ['primary'];
  try {
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData.items) && listData.items.length > 0) {
        const discovered = listData.items
          .filter((cal: any) => cal && cal.id && !String(cal.id).includes('#contacts@group'))
          .map((cal: any) => String(cal.id));
        if (discovered.length > 0) {
          calendarIds = discovered.slice(0, 8);
        }
      }
    }
  } catch {
    calendarIds = ['primary'];
  }

  let primaryError: Error | null = null;
  const allRawItems: GoogleCalendarRawEvent[] = [];
  const seenEventIds = new Set<string>();

  await Promise.all(
    calendarIds.map(async calId => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );
        if (!res.ok) {
          if (calId === 'primary' || calendarIds.length === 1) {
            const errText = await res.text();
            primaryError = new Error(`Errore Google Calendar (${res.status}): ${errText}`);
          }
          return;
        }
        const data = await res.json();
        const items: GoogleCalendarRawEvent[] = Array.isArray(data.items) ? data.items : [];
        items.forEach(it => {
          if (it && it.id && !seenEventIds.has(it.id)) {
            seenEventIds.add(it.id);
            allRawItems.push(it);
          }
        });
      } catch (e: any) {
        if (calId === 'primary') primaryError = e;
      }
    })
  );

  if (primaryError && allRawItems.length === 0) {
    throw primaryError;
  }

  const items = allRawItems;

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

/**
 * Parses an iCal / .ics file (e.g. exported from a school Google Calendar or ITS portal)
 * into CalendarEventItem objects so school events can be imported even when the school domain blocks OAuth.
 */
export function parseIcsCalendarContent(
  icsText: string,
  defaultSubject = 'Generale'
): CalendarEventItem[] {
  if (!icsText || !icsText.includes('BEGIN:VEVENT')) return [];

  // Unfold multi-line RFC 5545 lines (CRLF + space/tab)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  const parsedEvents: CalendarEventItem[] = [];

  const parseIcsDateTime = (rawVal: string): { date: string; time: string } | null => {
    const clean = rawVal.trim().replace(/^.*:/, '');
    const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!match) return null;
    const [, yyyy, mm, dd, hh, min, , isUtc] = match;
    if (!hh || !min) {
      return { date: `${yyyy}-${mm}-${dd}`, time: '09:00' };
    }
    if (isUtc === 'Z') {
      const dt = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min)));
      if (!isNaN(dt.getTime())) {
        const lY = dt.getFullYear();
        const lM = String(dt.getMonth() + 1).padStart(2, '0');
        const lD = String(dt.getDate()).padStart(2, '0');
        const lH = String(dt.getHours()).padStart(2, '0');
        const lMin = String(dt.getMinutes()).padStart(2, '0');
        return { date: `${lY}-${lM}-${lD}`, time: `${lH}:${lMin}` };
      }
    }
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
  };

  const unescapeIcsText = (str: string): string =>
    str
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();

  blocks.forEach((rawBlock, idx) => {
    const endIdx = rawBlock.indexOf('END:VEVENT');
    const body = endIdx !== -1 ? rawBlock.slice(0, endIdx) : rawBlock;
    const lines = body.split(/\r?\n/);

    let uid = '';
    let summary = '';
    let description = '';
    let dtStartRaw = '';
    let dtEndRaw = '';

    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.startsWith('UID:') || upper.startsWith('UID;')) {
        uid = line.slice(line.indexOf(':') + 1).trim();
      } else if (upper.startsWith('SUMMARY:') || upper.startsWith('SUMMARY;')) {
        summary = unescapeIcsText(line.slice(line.indexOf(':') + 1));
      } else if (upper.startsWith('DESCRIPTION:') || upper.startsWith('DESCRIPTION;')) {
        description = unescapeIcsText(line.slice(line.indexOf(':') + 1));
      } else if (upper.startsWith('DTSTART:') || upper.startsWith('DTSTART;')) {
        dtStartRaw = line;
      } else if (upper.startsWith('DTEND:') || upper.startsWith('DTEND;')) {
        dtEndRaw = line;
      }
    }

    const startParsed = parseIcsDateTime(dtStartRaw);
    if (!startParsed) return;
    const endParsed = parseIcsDateTime(dtEndRaw) || {
      date: startParsed.date,
      time: '10:00'
    };

    const title = summary || 'Lezione / Evento';
    const category = inferCategoryFromSummary(title, description);

    parsedEvents.push({
      id: `ics_${uid || `${Date.now()}_${idx}`}`,
      title,
      date: startParsed.date,
      startTime: startParsed.time,
      endTime: endParsed.time,
      category,
      subject: defaultSubject,
      description,
      completed: false,
      color: CATEGORY_META[category].color
    });
  });

  return parsedEvents;
}

