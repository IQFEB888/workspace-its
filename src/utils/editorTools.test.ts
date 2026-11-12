import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMathExpression,
  computeCodeKeyDownEdit,
  computeContextMenuPosition,
  buildHighlightedCodeBlockHtml,
  buildInteractiveFormulaBoxHtml
} from './editorTools';

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
  // Normal click in top-left area
  const normal = computeContextMenuPosition(100, 100, 300, 400, 1440, 900);
  assert.equal(normal.x, 100);
  assert.equal(normal.y, 100);

  // Click near bottom edge -> flips upwards (850 - 400 = 450)
  const nearBottom = computeContextMenuPosition(200, 850, 300, 400, 1440, 900);
  assert.equal(nearBottom.x, 200);
  assert.equal(nearBottom.y, 450);

  // Click near bottom-right corner -> flips both leftwards and upwards
  const nearBottomRight = computeContextMenuPosition(1380, 860, 300, 400, 1440, 900);
  assert.equal(nearBottomRight.x, 1080);
  assert.equal(nearBottomRight.y, 460);
});

test('buildHighlightedCodeBlockHtml and buildInteractiveFormulaBoxHtml generate interactive inline boxes', () => {
  const codeHtml = buildHighlightedCodeBlockHtml('const x = 10;', 'javascript', 'test_code_1');
  assert.ok(codeHtml.includes('note-code-lang-select'));
  assert.ok(codeHtml.includes('value="python"'));
  assert.ok(codeHtml.includes('tok-kw'));

  const formulaHtml = buildInteractiveFormulaBoxHtml('25 * 4', 'test_form_1');
  assert.ok(formulaHtml.includes('note-formula-box'));
  assert.ok(formulaHtml.includes('= 100'));
});
