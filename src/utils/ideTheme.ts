/**
 * IDE Studio Theme, Window Docking, Layout Presets & Folder Tree Pure Utilities
 * Workspace ITS v4.2.0
 */
import type { PageItem } from '../types';

export type UiStyleMode = 'ide' | 'classic';
export type IdeThemeMode = 'dark' | 'light';
export type IdePaneId = 'explorer' | 'editor' | 'chat';
export type IdeDropZone = 'left' | 'right' | 'top' | 'bottom' | 'tab';
export type IdeLayoutPresetId =
  | 'studio-base'
  | 'lettura-slide'
  | 'ripasso-impilato'
  | 'focus-editor'
  | 'tutto-aperto';

export interface IdeWindowVisibility {
  explorer: boolean;
  editor: boolean;
  chat: boolean;
}

export interface IdeColumnGroup {
  id: string;
  panels: IdePaneId[];
  mode: 'stack' | 'tabs';
  activeTab: IdePaneId;
}

export interface IdeLayoutPresetMeta {
  id: IdeLayoutPresetId;
  label: string;
  description: string;
}

export const ALL_IDE_PANES: IdePaneId[] = ['explorer', 'editor', 'chat'];

export const DEFAULT_IDE_WINDOWS: IdeWindowVisibility = {
  explorer: true,
  editor: true,
  chat: true
};

export const DEFAULT_IDE_COLUMNS: IdeColumnGroup[] = [
  { id: 'col_explorer', panels: ['explorer'], mode: 'stack', activeTab: 'explorer' },
  { id: 'col_editor', panels: ['editor'], mode: 'stack', activeTab: 'editor' },
  { id: 'col_chat', panels: ['chat'], mode: 'stack', activeTab: 'chat' }
];

export const IDE_LAYOUT_PRESETS: IdeLayoutPresetMeta[] = [
  {
    id: 'studio-base',
    label: 'Studio Base',
    description: 'Explorer · Editor · AI Chat'
  },
  {
    id: 'lettura-slide',
    label: 'Lettura Slide',
    description: 'Explorer · Slide & Materiali'
  },
  {
    id: 'ripasso-impilato',
    label: 'Ripasso Impilato',
    description: 'Editor + AI Chat impilati · Explorer compresso'
  },
  {
    id: 'focus-editor',
    label: 'Focus Editor',
    description: 'Solo Editor a schermo intero'
  },
  {
    id: 'tutto-aperto',
    label: 'Tutto Aperto (3/3)',
    description: 'Ripristina tutte le 3 finestre affiancate'
  }
];

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

export function normalizeIdeColumns(raw: unknown): IdeColumnGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_IDE_COLUMNS.map(c => ({ ...c, panels: [...c.panels] }));
  }

  const seen = new Set<IdePaneId>();
  const cleaned: IdeColumnGroup[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<IdeColumnGroup>;
    const validPanels: IdePaneId[] = [];
    if (Array.isArray(candidate.panels)) {
      for (const p of candidate.panels) {
        if ((p === 'explorer' || p === 'editor' || p === 'chat') && !seen.has(p)) {
          seen.add(p);
          validPanels.push(p);
        }
      }
    }
    if (validPanels.length === 0) continue;
    const mode: 'stack' | 'tabs' = candidate.mode === 'tabs' && validPanels.length > 1 ? 'tabs' : 'stack';
    const activeTab: IdePaneId =
      candidate.activeTab && validPanels.includes(candidate.activeTab)
        ? candidate.activeTab
        : validPanels[0];
    cleaned.push({
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `col_${validPanels.join('_')}`,
      panels: validPanels,
      mode,
      activeTab
    });
  }

  for (const pane of ALL_IDE_PANES) {
    if (!seen.has(pane)) {
      cleaned.push({
        id: `col_${pane}`,
        panels: [pane],
        mode: 'stack',
        activeTab: pane
      });
    }
  }

  return cleaned.length > 0 ? cleaned : DEFAULT_IDE_COLUMNS.map(c => ({ ...c, panels: [...c.panels] }));
}

/**
 * Moves/docks an IDE pane onto another pane's zone:
 * - 'left' / 'right': moves source into its own column to the left or right of target's column
 * - 'top' / 'bottom': stacks source vertically above or below target inside target's column
 * - 'tab': merges source into target's column as a VS Code tab group
 */
export function moveIdePanel(
  columns: IdeColumnGroup[],
  sourcePanel: IdePaneId,
  targetPanel: IdePaneId,
  zone: IdeDropZone
): IdeColumnGroup[] {
  if (sourcePanel === targetPanel) return columns;

  const base = normalizeIdeColumns(columns);
  // 1. Strip sourcePanel out of its previous column
  const withoutSource: IdeColumnGroup[] = [];
  for (const col of base) {
    const remaining = col.panels.filter(p => p !== sourcePanel);
    if (remaining.length === 0) continue;
    withoutSource.push({
      ...col,
      panels: remaining,
      mode: remaining.length > 1 ? col.mode : 'stack',
      activeTab: remaining.includes(col.activeTab) ? col.activeTab : remaining[0]
    });
  }

  const targetColIdx = withoutSource.findIndex(c => c.panels.includes(targetPanel));
  if (targetColIdx === -1) return base;

  if (zone === 'left' || zone === 'right') {
    const newCol: IdeColumnGroup = {
      id: `col_${sourcePanel}_${Date.now().toString(36).slice(-4)}`,
      panels: [sourcePanel],
      mode: 'stack',
      activeTab: sourcePanel
    };
    const insertIdx = zone === 'left' ? targetColIdx : targetColIdx + 1;
    const next = [...withoutSource];
    next.splice(insertIdx, 0, newCol);
    return next;
  }

  const targetCol = withoutSource[targetColIdx];
  const targetPosInCol = targetCol.panels.indexOf(targetPanel);

  if (zone === 'tab') {
    const nextPanels = [...targetCol.panels, sourcePanel];
    const updatedCol: IdeColumnGroup = {
      ...targetCol,
      panels: nextPanels,
      mode: 'tabs',
      activeTab: sourcePanel
    };
    return withoutSource.map((c, idx) => (idx === targetColIdx ? updatedCol : c));
  }

  // 'top' or 'bottom' -> vertical stack inside target column
  const nextPanels = [...targetCol.panels];
  const insertAt = zone === 'top' ? targetPosInCol : targetPosInCol + 1;
  nextPanels.splice(insertAt, 0, sourcePanel);
  const updatedCol: IdeColumnGroup = {
    ...targetCol,
    panels: nextPanels,
    mode: 'stack',
    activeTab: sourcePanel
  };
  return withoutSource.map((c, idx) => (idx === targetColIdx ? updatedCol : c));
}

export function toggleIdeColumnMode(columns: IdeColumnGroup[], colId: string): IdeColumnGroup[] {
  return columns.map(col => {
    if (col.id !== colId || col.panels.length < 2) return col;
    return {
      ...col,
      mode: col.mode === 'tabs' ? 'stack' : 'tabs'
    };
  });
}

export function setIdeColumnActiveTab(
  columns: IdeColumnGroup[],
  colId: string,
  panelId: IdePaneId
): IdeColumnGroup[] {
  return columns.map(col => {
    if (col.id !== colId || !col.panels.includes(panelId)) return col;
    return {
      ...col,
      activeTab: panelId
    };
  });
}

export function applyIdeLayoutPreset(presetId: IdeLayoutPresetId): {
  windows: IdeWindowVisibility;
  columns: IdeColumnGroup[];
  collapsedExplorer: boolean;
  activeTab: 'notes' | 'materials' | 'calendar';
} {
  switch (presetId) {
    case 'lettura-slide':
      return {
        windows: { explorer: true, editor: true, chat: false },
        columns: DEFAULT_IDE_COLUMNS.map(c => ({ ...c, panels: [...c.panels] })),
        collapsedExplorer: false,
        activeTab: 'materials'
      };
    case 'ripasso-impilato':
      return {
        windows: { explorer: true, editor: true, chat: true },
        columns: [
          { id: 'col_explorer', panels: ['explorer'], mode: 'stack', activeTab: 'explorer' },
          { id: 'col_editor_chat', panels: ['editor', 'chat'], mode: 'stack', activeTab: 'editor' }
        ],
        collapsedExplorer: true,
        activeTab: 'notes'
      };
    case 'focus-editor':
      return {
        windows: { explorer: false, editor: true, chat: false },
        columns: DEFAULT_IDE_COLUMNS.map(c => ({ ...c, panels: [...c.panels] })),
        collapsedExplorer: false,
        activeTab: 'notes'
      };
    case 'tutto-aperto':
    case 'studio-base':
    default:
      return {
        windows: { explorer: true, editor: true, chat: true },
        columns: DEFAULT_IDE_COLUMNS.map(c => ({ ...c, panels: [...c.panels] })),
        collapsedExplorer: false,
        activeTab: 'notes'
      };
  }
}

export function detectActiveIdePreset(
  windows: IdeWindowVisibility,
  columns: IdeColumnGroup[],
  collapsedExplorer: boolean,
  activeTab: 'notes' | 'materials' | 'calendar'
): IdeLayoutPresetId | 'custom' {
  const isDefaultOrder =
    columns.length === 3 &&
    columns[0].panels.join(',') === 'explorer' &&
    columns[1].panels.join(',') === 'editor' &&
    columns[2].panels.join(',') === 'chat';

  if (isDefaultOrder && windows.explorer && windows.editor && windows.chat && !collapsedExplorer && activeTab === 'notes') {
    return 'studio-base';
  }
  if (isDefaultOrder && windows.explorer && windows.editor && !windows.chat && !collapsedExplorer && activeTab === 'materials') {
    return 'lettura-slide';
  }
  if (isDefaultOrder && !windows.explorer && windows.editor && !windows.chat && activeTab === 'notes') {
    return 'focus-editor';
  }
  if (
    columns.length === 2 &&
    columns[0].panels.join(',') === 'explorer' &&
    columns[1].panels.join(',') === 'editor,chat' &&
    columns[1].mode === 'stack' &&
    windows.explorer &&
    windows.editor &&
    windows.chat &&
    collapsedExplorer
  ) {
    return 'ripasso-impilato';
  }
  return 'custom';
}

export interface ExplorerFolderGroup {
  name: string;
  pages: PageItem[];
}

export function groupPagesByFolder(
  pages: PageItem[],
  extraFolders: string[] = []
): { folders: ExplorerFolderGroup[]; rootPages: PageItem[] } {
  const folderMap = new Map<string, PageItem[]>();
  for (const rawName of extraFolders) {
    const clean = rawName.trim();
    if (clean && !folderMap.has(clean)) {
      folderMap.set(clean, []);
    }
  }

  const rootPages: PageItem[] = [];
  for (const page of pages) {
    const folderName = (page.folder || '').trim();
    if (folderName) {
      const list = folderMap.get(folderName) || [];
      list.push(page);
      folderMap.set(folderName, list);
    } else {
      rootPages.push(page);
    }
  }

  const folders: ExplorerFolderGroup[] = Array.from(folderMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'it', { sensitivity: 'base' }))
    .map(([name, groupPages]) => ({ name, pages: groupPages }));

  return { folders, rootPages };
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

export interface IdePanePlacement {
  visible: boolean;
  colId: string;
  gridColumn: number;
  gridRow: string;
  hideWindowHeader: boolean;
  isTabbedColumn: boolean;
  isStackedMulti: boolean;
  hasLeftBorder: boolean;
  hasTopBorder: boolean;
}

export interface IdeTabbarPlacement {
  colId: string;
  gridColumn: number;
  panels: IdePaneId[];
  activeTab: IdePaneId;
}

export interface IdeGridLayoutComputation {
  gridTemplateColumns: string;
  gridTemplateRows: string;
  placements: Record<IdePaneId, IdePanePlacement>;
  tabbar: IdeTabbarPlacement | null;
  visibleColumnsCount: number;
}

/**
 * Pure CSS Grid placement solver for all partitions of {explorer, editor, chat}:
 * supports arbitrary left/right column order, top/bottom vertical stacking,
 * VS Code tabbed columns, collapsed Explorer rail, and maximized single-pane view
 * without ever unmounting #notes-area or losing editor DOM state.
 */
export function computeIdeGridPlacement(
  columns: IdeColumnGroup[],
  windows: IdeWindowVisibility,
  collapsedExplorer: boolean,
  maximizedPaneId: IdePaneId | null,
  explorerWidth: number,
  chatWidth: number
): IdeGridLayoutComputation {
  const hiddenPlacement = (pane: IdePaneId): IdePanePlacement => ({
    visible: false,
    colId: `col_${pane}`,
    gridColumn: 1,
    gridRow: '1',
    hideWindowHeader: false,
    isTabbedColumn: false,
    isStackedMulti: false,
    hasLeftBorder: false,
    hasTopBorder: false
  });

  const placements: Record<IdePaneId, IdePanePlacement> = {
    explorer: hiddenPlacement('explorer'),
    editor: hiddenPlacement('editor'),
    chat: hiddenPlacement('chat')
  };

  if (maximizedPaneId && windows[maximizedPaneId]) {
    const owner = columns.find(c => c.panels.includes(maximizedPaneId));
    placements[maximizedPaneId] = {
      visible: true,
      colId: owner?.id || `col_${maximizedPaneId}`,
      gridColumn: 1,
      gridRow: '1',
      hideWindowHeader: false,
      isTabbedColumn: false,
      isStackedMulti: false,
      hasLeftBorder: false,
      hasTopBorder: false
    };
    return {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr)',
      placements,
      tabbar: null,
      visibleColumnsCount: 1
    };
  }

  const normCols = normalizeIdeColumns(columns);
  const visCols = normCols
    .map(col => ({
      ...col,
      visiblePanels: col.panels.filter(p => windows[p])
    }))
    .filter(col => col.visiblePanels.length > 0);

  if (visCols.length === 0) {
    placements.editor = {
      ...hiddenPlacement('editor'),
      visible: true
    };
    return {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr)',
      placements,
      tabbar: null,
      visibleColumnsCount: 1
    };
  }

  const tabbedCol = visCols.find(c => c.visiblePanels.length > 1 && c.mode === 'tabs') || null;
  const stackedCol = visCols.find(c => c.visiblePanels.length > 1 && c.mode === 'stack') || null;

  const colTracks = visCols.map(col => {
    const isSingleExplorer = col.visiblePanels.length === 1 && col.visiblePanels[0] === 'explorer';
    const isSingleChat = col.visiblePanels.length === 1 && col.visiblePanels[0] === 'chat';
    if (isSingleExplorer && collapsedExplorer && visCols.length > 1) return '42px';
    if (isSingleExplorer && visCols.length > 1) return `${Math.max(180, Math.min(420, explorerWidth))}px`;
    if (isSingleChat && visCols.length > 1) return `${Math.max(260, Math.min(560, chatWidth))}px`;
    return 'minmax(0, 1fr)';
  });

  let gridTemplateRows = 'minmax(0, 1fr)';
  if (tabbedCol) {
    gridTemplateRows = '35px minmax(0, 1fr)';
  } else if (stackedCol) {
    gridTemplateRows =
      stackedCol.visiblePanels.length === 3
        ? 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)'
        : 'minmax(0, 1fr) minmax(0, 1fr)';
  }

  let tabbar: IdeTabbarPlacement | null = null;

  visCols.forEach((col, colIdx) => {
    const gridCol = colIdx + 1;
    const isMulti = col.visiblePanels.length > 1;
    const isTabbed = isMulti && col.mode === 'tabs';
    const activeTab = col.visiblePanels.includes(col.activeTab)
      ? col.activeTab
      : col.visiblePanels[0];

    if (isTabbed) {
      tabbar = {
        colId: col.id,
        gridColumn: gridCol,
        panels: col.visiblePanels,
        activeTab
      };
      col.visiblePanels.forEach(pane => {
        placements[pane] = {
          visible: pane === activeTab,
          colId: col.id,
          gridColumn: gridCol,
          gridRow: '2',
          hideWindowHeader: true,
          isTabbedColumn: true,
          isStackedMulti: false,
          hasLeftBorder: colIdx > 0,
          hasTopBorder: false
        };
      });
    } else if (isMulti) {
      col.visiblePanels.forEach((pane, pIdx) => {
        placements[pane] = {
          visible: true,
          colId: col.id,
          gridColumn: gridCol,
          gridRow: `${pIdx + 1}`,
          hideWindowHeader: false,
          isTabbedColumn: false,
          isStackedMulti: true,
          hasLeftBorder: colIdx > 0,
          hasTopBorder: pIdx > 0
        };
      });
    } else {
      const pane = col.visiblePanels[0];
      placements[pane] = {
        visible: true,
        colId: col.id,
        gridColumn: gridCol,
        gridRow: tabbedCol || stackedCol ? '1 / -1' : '1',
        hideWindowHeader: false,
        isTabbedColumn: false,
        isStackedMulti: false,
        hasLeftBorder: colIdx > 0,
        hasTopBorder: false
      };
    }
  });

  return {
    gridTemplateColumns: colTracks.join(' '),
    gridTemplateRows,
    placements,
    tabbar,
    visibleColumnsCount: visCols.length
  };
}

