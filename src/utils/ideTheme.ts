/**
 * IDE Studio Theme & Window Layout Pure Utilities (Workspace ITS v4.1.0)
 * Manages reversible UI style ('ide' | 'classic'), Dark/Light IDE posture,
 * window visibility guards, live note word counts, and subject color dots.
 */

export type UiStyleMode = 'ide' | 'classic';
export type IdeThemeMode = 'dark' | 'light';

export interface IdeWindowVisibility {
  explorer: boolean;
  editor: boolean;
  chat: boolean;
}

export const DEFAULT_IDE_WINDOWS: IdeWindowVisibility = {
  explorer: true,
  editor: true,
  chat: true
};

const SUBJECT_DOT_PALETTE = [
  '#3b82f6', // Blue (like Programmazione C)
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1'  // Indigo
];

export function countVisibleIdeWindows(windows: IdeWindowVisibility): number {
  return (windows.explorer ? 1 : 0) + (windows.editor ? 1 : 0) + (windows.chat ? 1 : 0);
}

/**
 * Toggles one IDE pane while guaranteeing at least one pane remains open
 * so the workspace can never collapse into an empty screen.
 */
export function toggleIdeWindowSafe(
  current: IdeWindowVisibility,
  target: keyof IdeWindowVisibility
): IdeWindowVisibility {
  const nextVal = !current[target];
  if (!nextVal && countVisibleIdeWindows(current) <= 1) {
    return current;
  }
  return {
    ...current,
    [target]: nextVal
  };
}

export function normalizeUiStyle(raw: unknown): UiStyleMode {
  return raw === 'classic' ? 'classic' : 'ide';
}

export function normalizeIdeThemeMode(raw: unknown): IdeThemeMode {
  return raw === 'light' ? 'light' : 'dark';
}

export function computeNoteWordCount(html: string): number {
  if (!html) return 0;
  const plain = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 0;
  return plain.split(' ').filter(Boolean).length;
}

export function getSubjectDotColor(subjectName: string): string {
  const clean = (subjectName || '').trim().toLowerCase();
  if (!clean) return SUBJECT_DOT_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_DOT_PALETTE[hash % SUBJECT_DOT_PALETTE.length];
}
