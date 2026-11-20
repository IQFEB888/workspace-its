import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_IDE_WINDOWS,
  DEFAULT_IDE_COLUMNS,
  countVisibleIdeWindows,
  toggleIdeWindowSafe,
  normalizeUiStyle,
  normalizeIdeThemeMode,
  normalizeIdeColumns,
  moveIdePanel,
  toggleIdeColumnMode,
  setIdeColumnActiveTab,
  applyIdeLayoutPreset,
  detectActiveIdePreset,
  groupPagesByFolder,
  computeIdeGridPlacement,
  computeNoteWordCount,
  getSubjectDotColor
} from './ideTheme';

test('normalizeUiStyle defaults to ide and preserves classic when selected', () => {
  assert.equal(normalizeUiStyle(undefined), 'ide');
  assert.equal(normalizeUiStyle('ide'), 'ide');
  assert.equal(normalizeUiStyle('classic'), 'classic');
  assert.equal(normalizeUiStyle('invalid'), 'ide');
});

test('normalizeIdeThemeMode defaults to dark VS Code and supports light', () => {
  assert.equal(normalizeIdeThemeMode(undefined), 'dark');
  assert.equal(normalizeIdeThemeMode('dark'), 'dark');
  assert.equal(normalizeIdeThemeMode('light'), 'light');
});

test('toggleIdeWindowSafe toggles panes cleanly and never closes the last visible pane', () => {
  assert.equal(countVisibleIdeWindows(DEFAULT_IDE_WINDOWS), 3);

  const withoutChat = toggleIdeWindowSafe(DEFAULT_IDE_WINDOWS, 'chat');
  assert.deepEqual(withoutChat, { explorer: true, editor: true, chat: false });
  assert.equal(countVisibleIdeWindows(withoutChat), 2);

  const editorOnly = toggleIdeWindowSafe(withoutChat, 'explorer');
  assert.deepEqual(editorOnly, { explorer: false, editor: true, chat: false });
  assert.equal(countVisibleIdeWindows(editorOnly), 1);

  const guarded = toggleIdeWindowSafe(editorOnly, 'editor');
  assert.deepEqual(guarded, editorOnly);
});

test('moveIdePanel supports left/right reorder, top/bottom vertical stack, and tab merge', () => {
  // Move chat to the left of explorer
  const movedLeft = moveIdePanel(DEFAULT_IDE_COLUMNS, 'chat', 'explorer', 'left');
  assert.deepEqual(
    movedLeft.map(c => c.panels),
    [['chat'], ['explorer'], ['editor']]
  );

  // Stack chat vertically below editor (like 00:15 of reference video)
  const stacked = moveIdePanel(DEFAULT_IDE_COLUMNS, 'chat', 'editor', 'bottom');
  assert.equal(stacked.length, 2);
  assert.deepEqual(stacked[1].panels, ['editor', 'chat']);
  assert.equal(stacked[1].mode, 'stack');

  // Merge chat onto editor as VS Code tabs (like 00:20 of reference video)
  const tabbed = moveIdePanel(stacked, 'chat', 'editor', 'tab');
  assert.equal(tabbed.length, 2);
  assert.deepEqual(tabbed[1].panels, ['editor', 'chat']);
  assert.equal(tabbed[1].mode, 'tabs');
  assert.equal(tabbed[1].activeTab, 'chat');

  // Switch active tab and toggle back to stack
  const switched = setIdeColumnActiveTab(tabbed, tabbed[1].id, 'editor');
  assert.equal(switched[1].activeTab, 'editor');
  const backToStack = toggleIdeColumnMode(switched, switched[1].id);
  assert.equal(backToStack[1].mode, 'stack');

  // Un-dock chat back to the right as its own column
  const undocked = moveIdePanel(tabbed, 'chat', 'editor', 'right');
  assert.deepEqual(
    undocked.map(c => c.panels),
    [['explorer'], ['editor'], ['chat']]
  );
});

test('normalizeIdeColumns repairs corrupted or partial column definitions', () => {
  const repaired = normalizeIdeColumns([{ id: 'x', panels: ['editor'], mode: 'tabs', activeTab: 'editor' }]);
  assert.equal(repaired.length, 3);
  const allPanes = repaired.flatMap(c => c.panels).sort();
  assert.deepEqual(allPanes, ['chat', 'editor', 'explorer']);
});

test('applyIdeLayoutPreset and detectActiveIdePreset stay consistent', () => {
  const slidePreset = applyIdeLayoutPreset('lettura-slide');
  assert.equal(slidePreset.activeTab, 'materials');
  assert.equal(slidePreset.windows.chat, false);
  assert.equal(
    detectActiveIdePreset(slidePreset.windows, slidePreset.columns, slidePreset.collapsedExplorer, slidePreset.activeTab),
    'lettura-slide'
  );

  const stackedPreset = applyIdeLayoutPreset('ripasso-impilato');
  assert.equal(stackedPreset.collapsedExplorer, true);
  assert.deepEqual(stackedPreset.columns[1].panels, ['editor', 'chat']);
  assert.equal(
    detectActiveIdePreset(
      stackedPreset.windows,
      stackedPreset.columns,
      stackedPreset.collapsedExplorer,
      stackedPreset.activeTab
    ),
    'ripasso-impilato'
  );
});

test('groupPagesByFolder organizes notes into named folders and root notes cleanly', () => {
  const pages = [
    { id: '1', name: 'Intro', content: '' },
    { id: '2', name: 'Puntatori', content: '', folder: 'Lezioni C' },
    { id: '3', name: 'Malloc', content: '', folder: 'Lezioni C' }
  ];
  const grouped = groupPagesByFolder(pages, ['Esercizi']);
  assert.equal(grouped.rootPages.length, 1);
  assert.equal(grouped.rootPages[0].id, '1');
  assert.equal(grouped.folders.length, 2);
  assert.equal(grouped.folders[0].name, 'Esercizi');
  assert.equal(grouped.folders[0].pages.length, 0);
  assert.equal(grouped.folders[1].name, 'Lezioni C');
  assert.equal(grouped.folders[1].pages.length, 2);
});

test('computeNoteWordCount strips HTML tags and counts words accurately', () => {
  assert.equal(computeNoteWordCount(''), 0);
  assert.equal(computeNoteWordCount('<h1>Introduzione alla Programmazione in C</h1><p>Ciao&nbsp;mondo!</p>'), 7);
});

test('getSubjectDotColor returns consistent hex color for subjects', () => {
  const c1 = getSubjectDotColor('Programmazione C');
  const c2 = getSubjectDotColor('programmazione c');
  assert.equal(c1, c2);
  assert.match(c1, /^#[0-9a-f]{6}$/i);
});

test('computeIdeGridPlacement solves 3-col, stacked, tabbed, collapsed rail, and maximized grids', () => {
  const base = computeIdeGridPlacement(DEFAULT_IDE_COLUMNS, DEFAULT_IDE_WINDOWS, false, null, 240, 360);
  assert.equal(base.gridTemplateColumns, '240px minmax(0, 1fr) 360px');
  assert.equal(base.gridTemplateRows, 'minmax(0, 1fr)');
  assert.equal(base.tabbar, null);

  // Collapsed Explorer rail
  const rail = computeIdeGridPlacement(DEFAULT_IDE_COLUMNS, DEFAULT_IDE_WINDOWS, true, null, 240, 360);
  assert.equal(rail.gridTemplateColumns, '42px minmax(0, 1fr) 360px');

  // Vertical stack (Editor + Chat in col 2)
  const stackedCols = moveIdePanel(DEFAULT_IDE_COLUMNS, 'chat', 'editor', 'bottom');
  const stacked = computeIdeGridPlacement(stackedCols, DEFAULT_IDE_WINDOWS, false, null, 240, 360);
  assert.equal(stacked.gridTemplateRows, 'minmax(0, 1fr) minmax(0, 1fr)');
  assert.equal(stacked.placements.explorer.gridRow, '1 / -1');
  assert.equal(stacked.placements.editor.gridRow, '1');
  assert.equal(stacked.placements.chat.gridRow, '2');

  // Tabbed column (Editor + Chat merged as tabs in col 2)
  const tabbedCols = moveIdePanel(DEFAULT_IDE_COLUMNS, 'chat', 'editor', 'tab');
  const tabbed = computeIdeGridPlacement(tabbedCols, DEFAULT_IDE_WINDOWS, false, null, 240, 360);
  assert.equal(tabbed.gridTemplateRows, '35px minmax(0, 1fr)');
  assert.ok(tabbed.tabbar);
  assert.equal(tabbed.tabbar?.activeTab, 'chat');
  assert.equal(tabbed.placements.chat.visible, true);
  assert.equal(tabbed.placements.editor.visible, false);

  // Maximized single pane
  const max = computeIdeGridPlacement(DEFAULT_IDE_COLUMNS, DEFAULT_IDE_WINDOWS, false, 'editor', 240, 360);
  assert.equal(max.gridTemplateColumns, 'minmax(0, 1fr)');
  assert.equal(max.placements.editor.visible, true);
  assert.equal(max.placements.explorer.visible, false);
  assert.equal(max.placements.chat.visible, false);
});

