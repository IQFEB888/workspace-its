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
  parseAiNoteEditIntent,
  parseCalendarChatCommand,
  answerCalendarQueryLocally,
  buildCalendarScheduleContextForChat,
  convertAiMarkdownToNoteHtml,
  applyTargetedBoxReplacement,
  computeTabSlideDirection
} from './editorTools';
import { executeSqlLocally, resetSqlDatabase } from './sqlEngine';
import { parseIcsCalendarContent } from '../services/googleCalendarService';
import { runBashLocally } from '../services/codeRunnerService';

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

test('parseAiNoteEditIntent detects general, topic-specific, and box-specific edit commands', () => {
  const general = parseAiNoteEditIntent('evidenzia le robe chiave negli appunti');
  assert.equal(general.isDirectNoteEdit, true);
  assert.equal(general.mode, 'highlight');
  assert.equal(general.targetTopic, null);

  const topicSpecific = parseAiNoteEditIntent('evidenzia le parti importanti della parte dove parlo delle select');
  assert.equal(topicSpecific.isDirectNoteEdit, true);
  assert.equal(topicSpecific.mode, 'highlight');
  assert.equal(topicSpecific.targetTopic, 'select');

  const codeBoxEdit = parseAiNoteEditIntent(
    'nel blocco di codice dove faccio il ciclo per calcolare fibonacci sistemalo e sostituiscilo gia nella box'
  );
  assert.equal(codeBoxEdit.isDirectNoteEdit, true);
  assert.equal(codeBoxEdit.mode, 'edit_code_box');
  assert.ok(codeBoxEdit.targetTopic?.includes('fibonacci'));

  const formulaBoxEdit = parseAiNoteEditIntent('nella formula dell iva correggi 1.20 con 1.22 e sostituiscila nella box');
  assert.equal(formulaBoxEdit.isDirectNoteEdit, true);
  assert.equal(formulaBoxEdit.mode, 'edit_formula_box');

  const quoteBoxEdit = parseAiNoteEditIntent('nella citazione di Turing correggi il testo e sostituiscilo nella citazione');
  assert.equal(quoteBoxEdit.isDirectNoteEdit, true);
  assert.equal(quoteBoxEdit.mode, 'edit_quote_box');

  const normalQuestion = parseAiNoteEditIntent('spiegami cos e una inner join in sql');
  assert.equal(normalQuestion.isDirectNoteEdit, false);
});

test('convertAiMarkdownToNoteHtml converts fenced code, formulas, and blockquotes into interactive boxes and applyTargetedBoxReplacement updates in-place', () => {
  const md = [
    'Ecco lo script per Fibonacci in Bash:',
    '```bash',
    'a=0',
    'b=1',
    'for (( i=0; i<5; i++ )); do',
    '  echo $a',
    '  fn=$((a + b))',
    '  a=$b',
    '  b=$fn',
    'done',
    '```',
    '$$ 125 * 4 $$',
    '> La semplicità è la massima sofisticazione.'
  ].join('\n');

  const html = convertAiMarkdownToNoteHtml(md);
  assert.ok(html.includes('class="note-code-block"'));
  assert.ok(html.includes('data-lang="bash"'));
  assert.ok(html.includes('class="note-formula-box"'));
  assert.ok(html.includes('= 500'));
  assert.ok(html.includes('note-quote-block'));

  // Test partial replacement inside existing code box in html
  const replaced = applyTargetedBoxReplacement(html, {
    boxType: 'code',
    targetTopic: 'fibonacci',
    partialOldSnippet: 'for (( i=0; i<5; i++ )); do',
    newContent: 'for (( i=0; i<8; i++ )); do'
  });
  assert.equal(replaced.matched, true);
  assert.ok(decodeURIComponent(replaced.updatedHtml).includes('i<8'));
  assert.ok(decodeURIComponent(replaced.updatedHtml).includes('fn=$((a + b))'));
});

test('runBashLocally executes Bash Fibonacci loop and arithmetic locally without Gemini errors', () => {
  const script = [
    'a=0',
    'b=1',
    'for (( i=0; i<6; i++ )); do',
    '  echo $a',
    '  fn=$((a + b))',
    '  a=$b',
    '  b=$fn',
    'done'
  ].join('\n');

  const res = runBashLocally(script);
  assert.ok(res);
  assert.equal(res.stderr, '');
  assert.deepEqual(res.stdout.trim().split('\n'), ['0', '1', '1', '2', '3', '5']);
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

test('parseIcsCalendarContent parses school iCal .ics events into CalendarEventItem list', () => {
  const sampleIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:evt-101@its.edu',
    'DTSTART:20261118T090000',
    'DTEND:20261118T130000',
    'SUMMARY:Lezione Architettura Cloud & Docker',
    'DESCRIPTION:Laboratorio pratico container',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-102@its.edu',
    'DTSTART:20261120T140000',
    'DTEND:20261120T160000',
    'SUMMARY:Esame Parziale Database SQL',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const events = parseIcsCalendarContent(sampleIcs, 'Cloud');
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Lezione Architettura Cloud & Docker');
  assert.equal(events[0].date, '2026-11-18');
  assert.equal(events[0].startTime, '09:00');
  assert.equal(events[0].endTime, '13:00');
  assert.equal(events[0].category, 'lecture');
  assert.equal(events[1].category, 'exam');
});

test('parseCalendarChatCommand parses Italian natural-language reminder/event requests and answerCalendarQueryLocally answers schedule questions', () => {
  const refNow = new Date(2026, 10, 15, 10, 0, 0); // 2026-11-15
  const cmd = parseCalendarChatCommand(
    'aggiungi un promemoria per domani alle 15:30 per studiare Database SQL',
    ['Database', 'Cloud', 'Sviluppo Web'],
    refNow
  );
  assert.ok(cmd);
  assert.equal(cmd.isAddCommand, true);
  assert.equal(cmd.date, '2026-11-16');
  assert.equal(cmd.startTime, '15:30');
  assert.equal(cmd.endTime, '16:30');
  assert.equal(cmd.subject, 'Database');
  assert.ok(cmd.title.toLowerCase().includes('studiare database'));

  const sampleSchedule = [
    {
      id: 'ev1',
      title: 'Lezione Database Relazionali',
      date: '2026-11-16',
      startTime: '09:00',
      endTime: '13:00',
      category: 'lecture' as const,
      subject: 'Database',
      completed: false
    }
  ];

  const reply = answerCalendarQueryLocally('che materie ho domani?', sampleSchedule, refNow);
  assert.equal(reply.isCalendarQuery, true);
  assert.ok(reply.replyMarkdown.includes('Lezione Database Relazionali'));
  assert.ok(reply.replyMarkdown.includes('09:00'));

  const ctx = buildCalendarScheduleContextForChat(sampleSchedule, refNow);
  assert.ok(ctx.includes('Lezione Database Relazionali'));
});

test('computeTabSlideDirection returns lateral slide direction based on tab index order', () => {
  const tabs = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
  assert.equal(computeTabSlideDirection(tabs, 'p1', 'p2'), 'from-right');
  assert.equal(computeTabSlideDirection(tabs, 'p1', 'p3'), 'from-right');
  assert.equal(computeTabSlideDirection(tabs, 'p3', 'p1'), 'from-left');
  assert.equal(computeTabSlideDirection(tabs, 'p2', 'p1'), 'from-left');
  assert.equal(computeTabSlideDirection(tabs, 'p2', 'p2'), null);
});



