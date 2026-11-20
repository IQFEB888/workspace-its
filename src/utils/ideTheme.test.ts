import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_IDE_WINDOWS,
  countVisibleIdeWindows,
  toggleIdeWindowSafe,
  normalizeUiStyle,
  normalizeIdeThemeMode,
  computeNoteWordCount,
  getSubjectDotColor
} from './ideTheme';

test('normalizeUiStyle defaults to ide and preserves classic when selected', () => {
  assert.equal(normalizeUiStyle(undefined), 'ide');
  assert.equal(normalizeUiStyle('ide'), 'ide');
  assert.equal(normalizeUiStyle('classic'), 'classic');
  assert.equal(normalizeUiStyle('unknown'), 'ide');
});

test('normalizeIdeThemeMode defaults to dark VS Code and supports light', () => {
  assert.equal(normalizeIdeThemeMode(undefined), 'dark');
  assert.equal(normalizeIdeThemeMode('dark'), 'dark');
  assert.equal(normalizeIdeThemeMode('light'), 'light');
});

test('toggleIdeWindowSafe toggles panes cleanly and never closes the last visible pane', () => {
  assert.equal(countVisibleIdeWindows(DEFAULT_IDE_WINDOWS), 3);

  const w2 = toggleIdeWindowSafe(DEFAULT_IDE_WINDOWS, 'chat');
  assert.deepEqual(w2, { explorer: true, editor: true, chat: false });
  assert.equal(countVisibleIdeWindows(w2), 2);

  const w1 = toggleIdeWindowSafe(w2, 'explorer');
  assert.deepEqual(w1, { explorer: false, editor: true, chat: false });
  assert.equal(countVisibleIdeWindows(w1), 1);

  // Attempting to close the last remaining pane (editor) must be prevented
  const wBlocked = toggleIdeWindowSafe(w1, 'editor');
  assert.deepEqual(wBlocked, w1);
  assert.equal(countVisibleIdeWindows(wBlocked), 1);

  // Re-opening chat works normally
  const wReopened = toggleIdeWindowSafe(w1, 'chat');
  assert.deepEqual(wReopened, { explorer: false, editor: true, chat: true });
});

test('computeNoteWordCount strips HTML tags and counts words accurately', () => {
  assert.equal(computeNoteWordCount(''), 0);
  assert.equal(computeNoteWordCount('<p>&nbsp;  </p>'), 0);
  assert.equal(
    computeNoteWordCount('<h1>Introduzione C</h1><p>Puntatori &amp; memoria dinamica in C.</p>'),
    8
  );
});

test('getSubjectDotColor returns consistent hex color for subjects', () => {
  const c1 = getSubjectDotColor('Programmazione C');
  const c2 = getSubjectDotColor('programmazione c');
  assert.equal(c1, c2);
  assert.ok(c1.startsWith('#'));
});
