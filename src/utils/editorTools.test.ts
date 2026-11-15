import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMathExpression,
  computeCodeKeyDownEdit,
  computeContextMenuPosition,
  buildHighlightedCodeBlockHtml,
  buildInteractiveFormulaBoxHtml,
  formatKeyboardEventToCombo,
  matchesShortcutCombo,
  addColorToPalette,
  removeColorFromPalette,
  buildInteractiveTableHtml,
  sanitizeAndUpgradeNoteHtml,
  buildSvgElementString,
  parseAiNoteEditIntent
} from './editorTools';
import { executeSqlLocally, resetSqlDatabase } from './sqlEngine';

test('evaluateMathExpression evaluates direct arithmetic, functions, and named formulas', () => {
  assert.equal(evaluateMathExpression('125 * 4'), '500');
  assert.equal(evaluateMathExpression('(25 * 4) + sqrt(144)'), '112');
  assert.equal(evaluateMathExpression('totale = 100 * 1.22'), '122');
  assert.equal(evaluateMathExpression('2^8'), '256');
  assert.equal(evaluateMathExpression('non una formula valida abc'), null);
});

test('computeCodeKeyDownEdit handles Tab indentation and Shift+Tab unindentation', () => {
  const code = 'console.log(1);';
  const res = computeCodeKeyDownEdit(code, 0, 0, 'Tab', false);
  assert.ok(res);
  assert.equal(res.newCode, '    console.log(1);');
  assert.equal(res.newCaret, 4);

  const unindent = computeCodeKeyDownEdit(res.newCode, 4, 4, 'Tab', true);
  assert.ok(unindent);
  assert.equal(unindent.newCode, 'console.log(1);');
  assert.equal(unindent.newCaret, 0);
});

test('computeCodeKeyDownEdit auto-indents inside loops and blocks on Enter', () => {
  const loopCode = 'for (let i = 0; i < 10; i++) {';
  const res = computeCodeKeyDownEdit(loopCode, loopCode.length, loopCode.length, 'Enter', false);
  assert.ok(res);
  assert.equal(res.newCode, 'for (let i = 0; i < 10; i++) {\n    ');
  assert.equal(res.newCaret, res.newCode.length);

  // Between matching braces {|}
  const bracesCode = 'while (true) {}';
  const cursorBetween = bracesCode.length - 1;
  const splitRes = computeCodeKeyDownEdit(bracesCode, cursorBetween, cursorBetween, 'Enter', false);
  assert.ok(splitRes);
  assert.equal(splitRes.newCode, 'while (true) {\n    \n}');
  assert.equal(splitRes.newCaret, 'while (true) {\n    '.length);

  // Python colon block
  const pyCode = 'for x in lista:';
  const pyRes = computeCodeKeyDownEdit(pyCode, pyCode.length, pyCode.length, 'Enter', false);
  assert.ok(pyRes);
  assert.equal(pyRes.newCode, 'for x in lista:\n    ');
});

test('computeContextMenuPosition flips upwards and leftwards when near viewport edges', () => {
  const normal = computeContextMenuPosition(100, 100, 300, 400, 1440, 900);
  assert.equal(normal.x, 100);
  assert.equal(normal.y, 100);

  const nearBottom = computeContextMenuPosition(200, 850, 300, 400, 1440, 900);
  assert.equal(nearBottom.x, 200);
  assert.equal(nearBottom.y, 450);

  const nearBottomRight = computeContextMenuPosition(1380, 860, 300, 400, 1440, 900);
  assert.equal(nearBottomRight.x, 1080);
  assert.equal(nearBottomRight.y, 460);
});

test('buildHighlightedCodeBlockHtml and buildInteractiveFormulaBoxHtml generate interactive inline boxes', () => {
  const codeHtml = buildHighlightedCodeBlockHtml('const x = 10;', 'javascript', 'test_code_1');
  assert.ok(codeHtml.includes('note-code-lang-select'));
  assert.ok(codeHtml.includes('note-code-run-btn'));
  assert.ok(codeHtml.includes('note-code-output'));
  assert.ok(codeHtml.includes('value="python"'));
  assert.ok(codeHtml.includes('tok-kw'));

  const formulaHtml = buildInteractiveFormulaBoxHtml('25 * 4', 'test_form_1');
  assert.ok(formulaHtml.includes('note-formula-box'));
  assert.ok(formulaHtml.includes('= 100'));
});

test('formatKeyboardEventToCombo and matchesShortcutCombo parse programmable key combinations', () => {
  assert.equal(formatKeyboardEventToCombo({ key: 'c', altKey: true }), 'Alt+C');
  assert.equal(formatKeyboardEventToCombo({ key: 'k', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+K');
  assert.equal(formatKeyboardEventToCombo({ key: 'a' }), null); // plain typing without modifiers
  assert.ok(matchesShortcutCombo({ key: 't', altKey: true }, 'Alt+T'));
  assert.ok(!matchesShortcutCombo({ key: 't', ctrlKey: true }, 'Alt+T'));
});

test('addColorToPalette and removeColorFromPalette manage custom and default colors', () => {
  const initial = ['#38bdf8', '#facc15'];
  const afterAdd = addColorToPalette(initial, '#ff0055');
  assert.deepEqual(afterAdd, ['#38bdf8', '#facc15', '#ff0055']);
  const afterRemove = removeColorFromPalette(afterAdd, '#38bdf8');
  assert.deepEqual(afterRemove, ['#facc15', '#ff0055']);
});

test('sanitizeAndUpgradeNoteHtml removes stuck legacy top code block and upgrades v2.6 code blocks', () => {
  const legacyTop =
    '<div class="note-code-block" data-lang="javascript"><div class="note-code-header">JS</div><pre class="note-code-pre"><code>old();</code></pre></div><h1>Benvenuto</h1>';
  const res = sanitizeAndUpgradeNoteHtml(legacyTop);
  assert.equal(res.changed, true);
  assert.equal(res.cleanedHtml, '<h1>Benvenuto</h1>');

  const midBlock =
    '<h1>Titolo</h1><div class="note-code-block"><div class="note-code-actions"><button class="note-code-copy-btn">Copia</button><button class="note-code-del-btn">X</button></div><pre><code>1</code></pre></div>';
  const upg = sanitizeAndUpgradeNoteHtml(midBlock);
  assert.equal(upg.changed, true);
  assert.ok(upg.cleanedHtml.includes('note-code-run-btn'));
});

test('buildInteractiveTableHtml and buildSvgElementString generate valid HTML/SVG', () => {
  const tbl = buildInteractiveTableHtml(3, 4, 'tbl_test');
  assert.ok(tbl.includes('class="note-table"'));
  assert.ok(tbl.includes('Intestazione 4'));

  const arrowSvg = buildSvgElementString('arrow', [{ x: 10, y: 10 }, { x: 100, y: 50 }], '#38bdf8', 4);
  assert.ok(arrowSvg.includes('<path'));
  assert.ok(arrowSvg.includes('stroke="#38bdf8"'));
  assert.ok(arrowSvg.includes('data-draw-item="true"'));
});

test('parseAiNoteEditIntent detects general and topic-specific highlight/edit commands', () => {
  const general = parseAiNoteEditIntent('evidenzia le robe chiave negli appunti');
  assert.equal(general.isDirectNoteEdit, true);
  assert.equal(general.mode, 'highlight');
  assert.equal(general.targetTopic, null);

  const topicSpecific = parseAiNoteEditIntent('evidenzia le parti importanti della parte dove parlo delle select');
  assert.equal(topicSpecific.isDirectNoteEdit, true);
  assert.equal(topicSpecific.mode, 'highlight');
  assert.equal(topicSpecific.targetTopic, 'select');

  const normalQuestion = parseAiNoteEditIntent('spiegami cos e una inner join in sql');
  assert.equal(normalQuestion.isDirectNoteEdit, false);
});

test('executeSqlLocally creates tables, inserts rows, updates, deletes, and selects formatted results', () => {
  resetSqlDatabase();
  const script = `
    CREATE TABLE corsi (
      id INT PRIMARY KEY AUTOINCREMENT,
      titolo VARCHAR(100),
      crediti INT
    );
    INSERT INTO corsi (titolo, crediti) VALUES ('Database SQL', 10), ('Reti Cloud', 8), ('Sviluppo Web', 12);
    UPDATE corsi SET crediti = 15 WHERE titolo = 'Database SQL';
    DELETE FROM corsi WHERE crediti < 10;
    SELECT id, titolo, crediti FROM corsi ORDER BY crediti DESC;
  `;
  const res = executeSqlLocally(script);
  assert.equal(res.handled, true);
  assert.equal(res.stderr, '');
  assert.ok(res.stdout.includes("Tabella 'corsi' creata"));
  assert.ok(res.stdout.includes('Database SQL'));
  assert.ok(res.stdout.includes('15'));
  assert.ok(res.stdout.includes('Sviluppo Web'));
  assert.ok(!res.stdout.includes('Reti Cloud'));
});




