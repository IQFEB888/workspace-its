/**
 * Editor Utilities:
 * - Safe Math & Formula Evaluator (inline live formula boxes & calculations)
 * - Multi-language Syntax Highlighter & Interactive Inline Code Block Builder
 * - Smart Tab & Loop/Block Auto-Indentation Engine
 * - Caret Offset Preservation for ContentEditable Code Blocks
 * - Viewport-Aware Context Menu Positioning (Flip Up / Left)
 * - Clipboard Image Compression for Note & Chat Screenshot Pasting
 */

export interface CodeLanguageOption {
  id: string;
  label: string;
  badge: string;
  sample: string;
}

export const CODE_LANGUAGES: CodeLanguageOption[] = [
  {
    id: 'javascript',
    label: 'JavaScript / TS',
    badge: 'JS / TS',
    sample: 'for (let i = 0; i < 10; i++) {\n    console.log(i);\n}'
  },
  {
    id: 'python',
    label: 'Python',
    badge: 'PYTHON',
    sample: 'for studente in lista:\n    print(studente)'
  },
  {
    id: 'sql',
    label: 'SQL / Database',
    badge: 'SQL',
    sample:
      "CREATE TABLE studenti (\n  id INT PRIMARY KEY,\n  nome VARCHAR(50),\n  voto INT\n);\nINSERT INTO studenti VALUES (1, 'Marco', 28), (2, 'Giulia', 30);\nSELECT * FROM studenti WHERE voto >= 28;"
  },
  {
    id: 'java',
    label: 'Java / C#',
    badge: 'JAVA / C#',
    sample: 'for (int i = 0; i < n; i++) {\n    System.out.println(i);\n}'
  },
  {
    id: 'cpp',
    label: 'C / C++',
    badge: 'C / C++',
    sample: 'for (int i = 0; i < n; i++) {\n    cout << i << endl;\n}'
  },
  {
    id: 'html',
    label: 'HTML / CSS',
    badge: 'HTML / CSS',
    sample: '<div class="card">\n    <h2>Titolo</h2>\n</div>'
  },
  {
    id: 'php',
    label: 'PHP',
    badge: 'PHP',
    sample: 'foreach ($utenti as $u) {\n    echo $u;\n}'
  },
  {
    id: 'bash',
    label: 'Bash / Linux',
    badge: 'BASH',
    sample: 'for f in *.txt; do\n    echo "$f"\ndone'
  },
  {
    id: 'json',
    label: 'JSON',
    badge: 'JSON',
    sample: '{\n    "corso": "ITS",\n    "attivo": true\n}'
  }
];

export const FORMULA_SYMBOLS = [
  { sym: '√(', label: '√x Radice' },
  { sym: '²', label: 'x² Quadrato' },
  { sym: '³', label: 'x³ Cubo' },
  { sym: 'ⁿ', label: 'xⁿ Potenza' },
  { sym: 'π', label: 'π Pi Greco' },
  { sym: '∑', label: '∑ Sommatoria' },
  { sym: '∫', label: '∫ Integrale' },
  { sym: 'Δ', label: 'Δ Delta' },
  { sym: '∞', label: '∞ Infinito' },
  { sym: '≈', label: '≈ Circa' },
  { sym: '≠', label: '≠ Diverso' },
  { sym: '≤', label: '≤ Minore/Ug.' },
  { sym: '≥', label: '≥ Maggiore/Ug.' },
  { sym: '±', label: '± Più/Meno' },
  { sym: '→', label: '→ Freccia' },
  { sym: '⇔', label: '⇔ Doppia Freccia' },
  { sym: '∈', label: '∈ Appartiene' },
  { sym: '∀', label: '∀ Per ogni' },
  { sym: '∩', label: '∩ Intersezione' },
  { sym: '∪', label: '∪ Unione' }
];

export const FORMULA_PRESETS = [
  { name: 'Equazione 2° Grado', expr: 'x = (-b ± √(b² - 4ac)) / (2a)' },
  { name: 'Teorema di Pitagora', expr: 'c = √(a² + b²)' },
  { name: 'Media Aritmetica', expr: 'μ = (∑ xᵢ) / N' },
  { name: 'Deviazione Standard', expr: 'σ = √( ∑(xᵢ - μ)² / N )' },
  { name: 'Legge di Ohm', expr: 'V = R · I   ⇒   I = V / R' },
  { name: 'Potenza Elettrica', expr: 'P = V · I = R · I²' },
  { name: 'Complessità Binaria', expr: 'O(log₂ n)   •   O(n log n)' },
  { name: 'Algebra Relazionale', expr: 'π_{attributi}(σ_{condizione}(Tabella))' }
];

/**
 * Safely evaluates a mathematical expression string.
 * Supports direct expressions ("(125 * 4) + sqrt(16)") as well as
 * named formulas ("area = 12 * 5" -> evaluates right-hand side "12 * 5" -> "60").
 * Returns formatted number string or null if invalid.
 */
export function evaluateMathExpression(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let expr = raw.trim().replace(/=\s*$/, '').trim();
  if (!expr) return null;

  // If the user wrote a named formula like "risultato = 25 * 4" or "y = sqrt(144) + 8",
  // evaluate the right-hand side after the first '=' if the left side is a variable name
  if (expr.includes('=') && !/[<>!]=/.test(expr)) {
    const parts = expr.split('=');
    if (parts.length === 2 && /^[a-zA-Z_α-ωΑ-Ω0-9\s]+$/.test(parts[0].trim())) {
      expr = parts[1].trim();
    }
  }

  expr = expr
    // Normalize math symbols
    .replace(/×/g, '*')
    .replace(/·/g, '*')
    .replace(/÷/g, '/')
    .replace(/:/g, '/')
    .replace(/−/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([0-9.]+)/g, 'sqrt($1)')
    .replace(/π/g, 'PI')
    .replace(/\bpi\b/gi, 'PI');

  // Support comma decimals if not inside multi-arg function like pow(2,3)
  if (!/\b(pow|min|max)\s*\(/i.test(expr)) {
    expr = expr.replace(/(\d),(\d)/g, '$1.$2');
  }

  // Handle percentage like 20% -> (20/100)
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');

  // Replace caret power ^ with **
  expr = expr.replace(/\^/g, '**');

  // Replace allowed math functions with Math.*
  const mathMap: Record<string, string> = {
    sqrt: 'Math.sqrt',
    sin: 'Math.sin',
    cos: 'Math.cos',
    tan: 'Math.tan',
    asin: 'Math.asin',
    acos: 'Math.acos',
    atan: 'Math.atan',
    abs: 'Math.abs',
    round: 'Math.round',
    floor: 'Math.floor',
    ceil: 'Math.ceil',
    log: 'Math.log10',
    ln: 'Math.log',
    exp: 'Math.exp',
    pow: 'Math.pow',
    min: 'Math.min',
    max: 'Math.max',
    PI: 'Math.PI',
    E: 'Math.E'
  };

  const tokenized = expr.replace(
    /\b(sqrt|sin|cos|tan|asin|acos|atan|abs|round|floor|ceil|log|ln|exp|pow|min|max|PI|E)\b/g,
    match => mathMap[match] || match
  );

  // Security validation: after replacing Math.* tokens, only digits, operators, parens, dots, commas, and spaces may remain
  const stripped = tokenized.replace(
    /Math\.(sqrt|sin|cos|tan|asin|acos|atan|abs|round|floor|ceil|log10|log|exp|pow|min|max|PI|E)/g,
    ''
  );
  if (!/^[0-9+\-*/().\s,%]+$/.test(stripped)) {
    return null;
  }

  // Must contain at least one digit or Math.PI
  if (!/[0-9]/.test(tokenized) && !tokenized.includes('Math.PI')) {
    return null;
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${tokenized});`);
    const result = fn();
    if (typeof result !== 'number' || !isFinite(result) || isNaN(result)) {
      return null;
    }
    const rounded = Math.round((result + Number.EPSILON) * 1e8) / 1e8;
    return String(rounded);
  } catch {
    return null;
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Single-pass syntax highlighter for code blocks inside notes.
 */
export function highlightCodeSyntax(rawCode: string, language: string): string {
  const escaped = escapeHtml(rawCode);
  const lang = (language || 'javascript').toLowerCase();

  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|--[^\n]*)|(&quot;(?:\\.|[^&])*?&quot;|'(?:\\.|[^'])*?'|`(?:\\.|[^`])*?`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

  const jsKeywords = new Set([
    'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'class', 'extends', 'new', 'import', 'from',
    'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof',
    'interface', 'type', 'implements', 'public', 'private', 'protected', 'static', 'readonly',
    'console', 'log'
  ]);
  const pyKeywords = new Set([
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and',
    'or', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda',
    'yield', 'pass', 'break', 'continue', 'global', 'nonlocal', 'assert', 'async', 'await',
    'print', 'range', 'len'
  ]);
  const sqlKeywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'ALTER', 'DROP', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'ON',
    'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS',
    'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE', 'UNION', 'PRIMARY', 'KEY',
    'FOREIGN', 'REFERENCES', 'INDEX', 'VIEW', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'
  ]);
  const cJavaKeywords = new Set([
    'public', 'private', 'protected', 'class', 'interface', 'struct', 'enum', 'void',
    'int', 'double', 'float', 'char', 'boolean', 'bool', 'long', 'short', 'String',
    'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'new', 'this', 'super', 'static', 'final', 'const', 'using', 'namespace', 'include',
    'std', 'cout', 'cin', 'endl', 'try', 'catch', 'throw', 'override', 'virtual', 'System', 'out', 'println'
  ]);
  const literals = new Set(['true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'NULL']);

  return escaped.replace(tokenRegex, (match, comment, strLiteral, numLiteral, word) => {
    if (comment) {
      return `<span class="tok-com">${comment}</span>`;
    }
    if (strLiteral) {
      return `<span class="tok-str">${strLiteral}</span>`;
    }
    if (numLiteral) {
      return `<span class="tok-num">${numLiteral}</span>`;
    }
    if (word) {
      if (literals.has(word)) {
        return `<span class="tok-num">${word}</span>`;
      }
      if (lang === 'sql' && sqlKeywords.has(word.toUpperCase())) {
        return `<span class="tok-kw">${word}</span>`;
      }
      if (lang === 'python' && pyKeywords.has(word)) {
        return `<span class="tok-kw">${word}</span>`;
      }
      if ((lang === 'java' || lang === 'cpp') && cJavaKeywords.has(word)) {
        return `<span class="tok-kw">${word}</span>`;
      }
      if (jsKeywords.has(word) || pyKeywords.has(word) || cJavaKeywords.has(word)) {
        return `<span class="tok-kw">${word}</span>`;
      }
      if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) {
        return `<span class="tok-fn">${word}</span>`;
      }
    }
    return match;
  });
}

/**
 * Generates an inline interactive code block HTML with an embedded language <select> dropdown,
 * Tab / Auto-indent support, and live syntax highlighting directly inside #notes-area.
 */
export function buildHighlightedCodeBlockHtml(
  code: string,
  languageId = 'javascript',
  blockId?: string
): string {
  const langObj = CODE_LANGUAGES.find(l => l.id === languageId) || CODE_LANGUAGES[0];
  const initialCode = typeof code === 'string' && code.length > 0 ? code : '';
  const highlighted = highlightCodeSyntax(initialCode, langObj.id);
  const encodedRaw = encodeURIComponent(initialCode);
  const uniqueId = blockId || `code_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const optionsHtml = CODE_LANGUAGES.map(
    l =>
      `<option value="${l.id}"${l.id === langObj.id ? ' selected="selected"' : ''}>${l.label}</option>`
  ).join('');

  return `<div class="note-code-block" id="${uniqueId}" data-lang="${langObj.id}" data-raw="${encodedRaw}" contenteditable="false"><div class="note-code-header"><div class="note-code-lang-wrap"><span class="note-code-dot">●</span><select class="note-code-lang-select" aria-label="Linguaggio blocco codice" title="Cambia linguaggio di programmazione">${optionsHtml}</select><span class="note-code-hint">Tab = Indenta • Auto-indent attivo</span></div><div class="note-code-actions"><button type="button" class="note-code-run-btn" data-run-code="true" title="Esegui codice e mostra output">▶ Esegui</button><button type="button" class="note-code-copy-btn" data-copy-code="true">📋 Copia</button><button type="button" class="note-code-del-btn" data-delete-code="true" title="Elimina blocco codice">✕</button></div></div><pre class="note-code-pre" contenteditable="true" spellcheck="false" data-placeholder="Scrivi o incolla il codice qui... (Premi Tab per indentare)"><code class="note-code-content">${highlighted || ''}</code></pre><div class="note-code-output" contenteditable="false" style="display:none;"></div></div><p><br></p>`;
}

/**
 * Generates an interactive live-evaluating Formula Box directly inside #notes-area.
 * Typing any mathematical expression inside `.note-formula-input` immediately computes and updates `.note-formula-output`.
 */
export function buildInteractiveFormulaBoxHtml(initialExpr = '', boxId?: string): string {
  const cleanInitial = initialExpr.trim();
  const evaluated = cleanInitial ? evaluateMathExpression(cleanInitial) : null;
  const uniqueId = boxId || `formula_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const escapedInitial = escapeHtml(cleanInitial);
  const outputText = evaluated !== null ? `= ${evaluated}` : '= ?';
  const hasValidResult = evaluated !== null;

  return `<span class="note-formula-box" id="${uniqueId}" contenteditable="false" data-formula="${escapedInitial}"><span class="note-formula-sigma" title="Formula / Calcolo Live">∑</span><span class="note-formula-input" contenteditable="true" spellcheck="false" role="textbox" aria-label="Formula o espressione matematica" data-placeholder="Scrivi calcolo o formula (es. 25 * 4)...">${escapedInitial}</span><span class="note-formula-output ${hasValidResult ? 'has-result' : 'is-symbolic'}" title="Risultato calcolato in automatico (clicca per copiare)">${outputText}</span><button type="button" class="note-formula-del-btn" data-delete-formula="true" title="Rimuovi box formula">✕</button></span>&nbsp;`;
}

/**
 * Pure, deterministic indentation and auto-indentation logic for code blocks.
 * Handles:
 * - Tab (inserts 4 spaces or indents multi-line selection)
 * - Shift+Tab (unindents up to 4 spaces)
 * - Enter (preserves current line's indentation AND automatically adds +1 indent level
 *   when inside a loop/block/function header like `for (...) {`, `if (...) {`, `while (...) {`,
 *   Python `for ...:`, `def ...:`, `if ...:`, or Bash `do` / `then`).
 * - Auto-splits `{|}` into three lines with cursor indented in the middle.
 */
export function computeCodeKeyDownEdit(
  code: string,
  selStart: number,
  selEnd: number,
  key: string,
  shiftKey = false
): { newCode: string; newCaret: number } | null {
  const INDENT = '    '; // 4 spaces

  if (key === 'Tab') {
    const before = code.slice(0, selStart);
    const selected = code.slice(selStart, selEnd);
    const after = code.slice(selEnd);

    if (!shiftKey) {
      if (selStart === selEnd || !selected.includes('\n')) {
        const newCode = before + INDENT + after;
        return { newCode, newCaret: selStart + INDENT.length };
      } else {
        // Multi-line indent
        const lineStartIdx = before.lastIndexOf('\n') + 1;
        const prefix = code.slice(0, lineStartIdx);
        const targetBlock = code.slice(lineStartIdx, selEnd);
        const indentedBlock = targetBlock
          .split('\n')
          .map(line => INDENT + line)
          .join('\n');
        const newCode = prefix + indentedBlock + after;
        return { newCode, newCaret: lineStartIdx + indentedBlock.length };
      }
    } else {
      // Shift+Tab: unindent current line by up to 4 spaces
      const lineStartIdx = before.lastIndexOf('\n') + 1;
      const currentLine = code.slice(lineStartIdx);
      const matchSpaces = currentLine.match(/^( {1,4}|\t)/);
      if (!matchSpaces) {
        return { newCode: code, newCaret: selStart };
      }
      const removeLen = matchSpaces[0].length;
      const newCode = code.slice(0, lineStartIdx) + code.slice(lineStartIdx + removeLen);
      const newCaret = Math.max(lineStartIdx, selStart - removeLen);
      return { newCode, newCaret };
    }
  }

  if (key === 'Enter') {
    const before = code.slice(0, selStart);
    const after = code.slice(selEnd);
    const lineStartIdx = before.lastIndexOf('\n') + 1;
    const currentLineBeforeCursor = before.slice(lineStartIdx);
    const leadingWhitespace = currentLineBeforeCursor.match(/^[ \t]*/)?.[0] || '';
    const trimmedBefore = currentLineBeforeCursor.trim();
    const trimmedAfter = after.replace(/^[ \t]*/, '');

    // Check if current line opens a loop, conditional, function, or block:
    // 1. Ends with '{', ':', '(', '['
    const endsWithBlockOpener = /[{:(\[]\s*$/.test(trimmedBefore);
    // 2. Or is a C/JS/Java loop/conditional header without brace yet (e.g. `for (...)`, `while (...)`, `if (...)`, `else`)
    const isLoopOrBranchHeader =
      /^(for|while|if|else\s+if|foreach|switch)\s*\(.*\)\s*$/.test(trimmedBefore) ||
      /^(else|do|try|finally)\s*$/.test(trimmedBefore) ||
      /\b(do|then)\s*$/.test(trimmedBefore);

    const shouldIncreaseIndent = endsWithBlockOpener || isLoopOrBranchHeader;
    const nextLineIndent = shouldIncreaseIndent ? leadingWhitespace + INDENT : leadingWhitespace;

    // Special case: cursor is right between `{` and `}` (or `(` and `)`, `[` and `]`)
    const lastCharBefore = trimmedBefore.slice(-1);
    const firstCharAfter = trimmedAfter.charAt(0);
    const isBetweenMatchingBrackets =
      (lastCharBefore === '{' && firstCharAfter === '}') ||
      (lastCharBefore === '(' && firstCharAfter === ')') ||
      (lastCharBefore === '[' && firstCharAfter === ']');

    if (isBetweenMatchingBrackets) {
      const insertion = '\n' + nextLineIndent + '\n' + leadingWhitespace;
      const newCode = before + insertion + after;
      const newCaret = before.length + 1 + nextLineIndent.length;
      return { newCode, newCaret };
    }

    const insertion = '\n' + nextLineIndent;
    const newCode = before + insertion + after;
    const newCaret = before.length + insertion.length;
    return { newCode, newCaret };
  }

  // Optional auto-closing curly brace `{` -> `{}` when followed by whitespace or end of line
  if (key === '{') {
    const before = code.slice(0, selStart);
    const after = code.slice(selEnd);
    if (selStart === selEnd && (/^\s*(\n|$)/.test(after))) {
      const newCode = before + '{}' + after;
      return { newCode, newCaret: selStart + 1 };
    }
  }

  return null;
}

/**
 * Gets the exact character offset (and selection end) of the current selection inside a root HTMLElement.
 */
export function getSelectionCharOffsetsWithin(root: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    const len = (root.textContent || '').length;
    return { start: len, end: len };
  }

  const preStartRange = range.cloneRange();
  preStartRange.selectNodeContents(root);
  preStartRange.setEnd(range.startContainer, range.startOffset);
  const start = preStartRange.toString().length;

  const preEndRange = range.cloneRange();
  preEndRange.selectNodeContents(root);
  preEndRange.setEnd(range.endContainer, range.endOffset);
  const end = preEndRange.toString().length;

  return { start, end };
}

/**
 * Restores the caret inside `root` at the specified character offset.
 */
export function setCaretCharOffsetWithin(root: HTMLElement, targetOffset: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let currentNode = walker.nextNode() as Text | null;
  let charCount = 0;

  while (currentNode) {
    const nodeLen = currentNode.length;
    if (charCount + nodeLen >= targetOffset) {
      const range = document.createRange();
      const offsetInNode = Math.max(0, Math.min(nodeLen, targetOffset - charCount));
      range.setStart(currentNode, offsetInNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    charCount += nodeLen;
    currentNode = walker.nextNode() as Text | null;
  }

  // Fallback: place caret at the end of root
  const fallbackRange = document.createRange();
  fallbackRange.selectNodeContents(root);
  fallbackRange.collapse(false);
  sel.removeAllRanges();
  sel.addRange(fallbackRange);
}

/**
 * Computes viewport-safe coordinates for the custom right-click context menu.
 * If the menu would overflow the bottom edge, it flips UPWARDS above the cursor.
 * If the menu would overflow the right edge, it flips LEFTWARDS to the left of the cursor.
 * Also clamps to top/left margins so it never leaves the screen on any direction.
 */
export function computeContextMenuPosition(
  clickX: number,
  clickY: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 12
): { x: number; y: number } {
  let x = clickX;
  let y = clickY;

  // Flip horizontally (to the left of the cursor) if overflowing right edge
  if (x + menuWidth > viewportWidth - margin) {
    x = clickX - menuWidth;
  }
  // Clamp horizontally within [margin, viewportWidth - menuWidth - margin]
  if (x + menuWidth > viewportWidth - margin) {
    x = viewportWidth - menuWidth - margin;
  }
  if (x < margin) {
    x = margin;
  }

  // Flip vertically (above the cursor) if overflowing bottom edge
  if (y + menuHeight > viewportHeight - margin) {
    y = clickY - menuHeight;
  }
  // Clamp vertically within [margin, viewportHeight - menuHeight - margin]
  if (y + menuHeight > viewportHeight - margin) {
    y = viewportHeight - menuHeight - margin;
  }
  if (y < margin) {
    y = margin;
  }

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Compresses an image File/Blob from clipboard into a clean Data URL + base64
 */
export function compressImageFromBlob(
  blob: Blob,
  maxWidth = 1200,
  quality = 0.84
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossibile leggere lo screenshot'));
    reader.onload = () => {
      const originalDataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => {
        const b64 = originalDataUrl.split(',')[1] || '';
        resolve({ dataUrl: originalDataUrl, base64: b64, mimeType: blob.type || 'image/png' });
      };
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const b64 = originalDataUrl.split(',')[1] || '';
          resolve({ dataUrl: originalDataUrl, base64: b64, mimeType: blob.type || 'image/png' });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outMime = 'image/jpeg';
        const compressedDataUrl = canvas.toDataURL(outMime, quality);
        const base64 = compressedDataUrl.split(',')[1] || '';
        resolve({ dataUrl: compressedDataUrl, base64, mimeType: outMime });
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// APP VERSION & PROGRAMMABLE KEYBOARD SHORTCUTS
// ============================================================================

export const APP_VERSION = 'v3.5.2';

export interface ShortcutDefinition {
  id:
    | 'insert_code'
    | 'insert_formula'
    | 'insert_table'
    | 'toggle_pen'
    | 'insert_quote'
    | 'open_find'
    | 'highlight_text'
    | 'new_page'
    | 'toggle_chat'
    | 'toggle_sidebar'
    | 'toggle_compact';
  label: string;
  desc: string;
  defaultCombo: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'insert_code',
    label: '💻 Inserisci Box Codice',
    desc: 'Inserisce una box di codice con syntax highlighting e menu linguaggio',
    defaultCombo: 'Alt+C'
  },
  {
    id: 'insert_formula',
    label: '∑ Inserisci Box Formula Live',
    desc: 'Inserisce una box matematica che calcola il risultato in tempo reale',
    defaultCombo: 'Alt+F'
  },
  {
    id: 'insert_table',
    label: '📊 Inserisci Tabella',
    desc: 'Inserisce una tabella modificabile (righe e colonne) negli appunti',
    defaultCombo: 'Alt+T'
  },
  {
    id: 'toggle_pen',
    label: '✏️ Attiva / Disattiva Penna Disegno',
    desc: 'Apre la modalità disegno a mano libera (frecce, penna, evidenziatore) su appunti e foto',
    defaultCombo: 'Alt+P'
  },
  {
    id: 'insert_quote',
    label: '💬 Inserisci Citazione',
    desc: 'Inserisce un blocco citazione / definizione importante',
    defaultCombo: 'Alt+Q'
  },
  {
    id: 'open_find',
    label: '🔍 Cerca e Sostituisci negli Appunti',
    desc: 'Apre la barra di ricerca rapida dentro gli appunti',
    defaultCombo: 'Ctrl+F'
  },
  {
    id: 'highlight_text',
    label: '🖍️ Evidenzia Testo Selezionato',
    desc: 'Evidenzia rapidamente il testo selezionato con il primo colore rapido',
    defaultCombo: 'Alt+H'
  },
  {
    id: 'new_page',
    label: '📄 Nuova Scheda Appunti',
    desc: 'Crea una nuova scheda di appunti nella materia corrente',
    defaultCombo: 'Alt+N'
  },
  {
    id: 'toggle_chat',
    label: '🤖 Apri / Chiudi Chat AI Gemini',
    desc: 'Mostra o riduce il pannello laterale di Gemini Copilot',
    defaultCombo: 'Alt+A'
  },
  {
    id: 'toggle_sidebar',
    label: '🛠️ Apri / Chiudi Barra Strumenti',
    desc: 'Mostra o riduce il pannello laterale sinistro degli strumenti',
    defaultCombo: 'Alt+S'
  },
  {
    id: 'toggle_compact',
    label: '⚡ Modalità Minimal Senza Sfondo',
    desc: 'Attiva o disattiva la modalità compatta ad alto contrasto',
    defaultCombo: 'Alt+M'
  }
];

export const DEFAULT_SHORTCUTS: Record<string, string> = SHORTCUT_DEFINITIONS.reduce(
  (acc, item) => ({ ...acc, [item.id]: item.defaultCombo }),
  {} as Record<string, string>
);

/**
 * Converts a KeyboardEvent-like object into a normalized shortcut combo string (e.g. "Ctrl+Shift+K", "Alt+C").
 * Returns null if only modifier keys were pressed.
 */
export function formatKeyboardEventToCombo(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): string | null {
  if (!e || !e.key) return null;
  const rawKey = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'CapsLock'].includes(rawKey)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Require at least one modifier (Ctrl, Alt, or Function key F1..F12) so normal typing isn't hijacked
  const isFunctionKey = /^F([1-9]|1[0-2])$/i.test(rawKey);
  if (parts.length === 0 && !isFunctionKey) {
    return null;
  }

  const normalizedKey =
    rawKey === ' '
      ? 'Space'
      : rawKey.length === 1
      ? rawKey.toUpperCase()
      : rawKey.charAt(0).toUpperCase() + rawKey.slice(1);

  parts.push(normalizedKey);
  return parts.join('+');
}

/**
 * Checks whether a KeyboardEvent matches a configured shortcut combo string.
 */
export function matchesShortcutCombo(
  e: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  },
  targetCombo: string
): boolean {
  if (!targetCombo || !targetCombo.trim()) return false;
  const current = formatKeyboardEventToCombo(e);
  if (!current) return false;
  return current.toLowerCase() === targetCombo.trim().toLowerCase();
}

// ============================================================================
// CUSTOM COLOR PALETTES (TEXT, HIGHLIGHT, PEN) WITH ADD / DELETE
// ============================================================================

export const DEFAULT_TEXT_COLORS = [
  '#f8fafc',
  '#38bdf8',
  '#facc15',
  '#4ade80',
  '#f43f5e',
  '#c084fc'
];

export const DEFAULT_HIGHLIGHT_COLORS = [
  '#fde047',
  '#4ade80',
  '#38bdf8',
  '#f472b6',
  '#c084fc'
];

export const DEFAULT_PEN_COLORS = [
  '#38bdf8',
  '#f43f5e',
  '#facc15',
  '#4ade80',
  '#c084fc',
  '#ffffff'
];

export function addColorToPalette(palette: string[], newHex: string, maxColors = 14): string[] {
  const clean = (newHex || '').trim().toLowerCase();
  if (!/^#[0-9a-f]{3,8}$/i.test(clean)) return palette;
  const filtered = palette.filter(c => c.toLowerCase() !== clean);
  return [...filtered, clean].slice(-maxColors);
}

export function removeColorFromPalette(palette: string[], colorToRemove: string): string[] {
  const target = (colorToRemove || '').trim().toLowerCase();
  return palette.filter(c => c.toLowerCase() !== target);
}

export function hexToHighlightRgba(hex: string, alpha = 0.36): string {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  } else if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return hex;
}

// ============================================================================
// INTERACTIVE TABLES IN NOTES (INSERT & MODIFY ROWS / COLUMNS)
// ============================================================================

export function buildInteractiveTableHtml(rows = 3, cols = 3, tableId?: string): string {
  const rCount = Math.max(1, Math.min(20, rows));
  const cCount = Math.max(1, Math.min(12, cols));
  const id = tableId || `tbl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  let headerCells = '';
  for (let c = 1; c <= cCount; c++) {
    headerCells += `<th>Intestazione ${c}</th>`;
  }

  let bodyRows = '';
  for (let r = 1; r < rCount; r++) {
    let cells = '';
    for (let c = 1; c <= cCount; c++) {
      cells += `<td>Dato ${r}.${c}</td>`;
    }
    bodyRows += `<tr>${cells}</tr>`;
  }

  return `<div class="note-table-wrapper" id="${id}" data-table-wrapper="true"><table class="note-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div><p><br></p>`;
}

// ============================================================================
// LEGACY CODE BLOCK SANITIZER (REMOVES OLD STUCK CODE BLOCK AT TOP OF NOTES)
// ============================================================================

/**
 * Cleans up legacy code blocks at the top of a note page (from older versions that lacked
 * the delete button or were stuck at the top of "Appunti Principali") and ensures all
 * remaining `.note-code-block` elements have a `.note-code-del-btn` delete button.
 */
export function sanitizeAndUpgradeNoteHtml(rawHtml: string): { cleanedHtml: string; changed: boolean } {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return { cleanedHtml: rawHtml || '', changed: false };
  }

  let html = rawHtml;
  let changed = false;

  // 1. Remove any .note-code-block at the very beginning of the note (preceded only by whitespace or empty <p>/<br>)
  const leadingCodeBlockRegex =
    /^(?:\s|<p>\s*(?:<br\s*\/?>|&nbsp;)?\s*<\/p>|<br\s*\/?>)*<div[^>]*class="[^"]*note-code-block[^"]*"[^>]*>[\s\S]*?<\/pre><\/div>(?:<p><br\s*\/?><\/p>)?/i;
  if (leadingCodeBlockRegex.test(html)) {
    html = html.replace(leadingCodeBlockRegex, '');
    changed = true;
  }

  // 2. Also remove any old-version .note-code-block that lacks `note-code-del-btn` anywhere in the note
  if (html.includes('note-code-block') && !html.includes('note-code-del-btn')) {
    const oldBlockRegex =
      /<div[^>]*class="[^"]*note-code-block[^"]*"[^>]*>(?:(?!note-code-del-btn)[\s\S])*?<\/pre><\/div>/gi;
    const nextHtml = html.replace(oldBlockRegex, '');
    if (nextHtml !== html) {
      html = nextHtml;
      changed = true;
    }
  }

  // 3. Upgrade v2.6 code blocks that have `note-code-copy-btn` but not `note-code-run-btn`
  if (html.includes('note-code-copy-btn') && !html.includes('note-code-run-btn')) {
    const upgraded = html.replace(
      /<button[^>]*class="note-code-copy-btn"/g,
      '<button type="button" class="note-code-run-btn" data-run-code="true" title="Esegui codice e mostra output">▶ Esegui</button><button type="button" class="note-code-copy-btn"'
    );
    if (upgraded !== html) {
      html = upgraded;
      changed = true;
    }
  }

  return { cleanedHtml: html, changed };
}

/**
 * Maps markdown fenced code language tags (e.g. "py", "js", "ts", "sh", "c++") to valid CODE_LANGUAGES IDs.
 */
export function normalizeCodeLanguageId(rawLang?: string | null): string {
  const l = (rawLang || '').trim().toLowerCase();
  if (!l) return 'javascript';
  if (l === 'js' || l === 'javascript' || l === 'ts' || l === 'typescript' || l === 'jsx' || l === 'tsx' || l === 'node') {
    return 'javascript';
  }
  if (l === 'py' || l === 'python' || l === 'python3') return 'python';
  if (l === 'sql' || l === 'mysql' || l === 'postgresql' || l === 'postgres' || l === 'sqlite' || l === 'plsql') {
    return 'sql';
  }
  if (l === 'sh' || l === 'bash' || l === 'shell' || l === 'zsh' || l === 'console' || l === 'terminal') {
    return 'bash';
  }
  if (l === 'c' || l === 'cpp' || l === 'c++' || l === 'cc' || l === 'cxx' || l === 'csharp' || l === 'cs') {
    return 'cpp';
  }
  if (l === 'java' || l === 'kotlin') return 'java';
  if (l === 'html' || l === 'css' || l === 'xml' || l === 'svg') return 'html';
  if (l === 'php') return 'php';
  if (l === 'json' || l === 'yaml' || l === 'yml') return 'json';
  return 'javascript';
}

/**
 * Converts AI markdown responses (containing ```lang code blocks, $$ formulas, and > quotes)
 * into rich, interactive Workspace ITS note HTML where:
 * - Every ```code``` block becomes an interactive `.note-code-block` box (with ▶ Esegui, 📋 Copia, language selector, syntax highlighting)
 * - Every ```formula / ```math or $$...$$ block becomes an interactive `.note-formula-box` live calculator
 * - Every > blockquote becomes a styled `.note-quote-block`
 */
export function convertAiMarkdownToNoteHtml(
  markdownText: string,
  markdownRenderer?: (md: string) => string
): string {
  if (!markdownText || typeof markdownText !== 'string') return '';

  const placeholders: Array<{ token: string; html: string }> = [];
  let working = markdownText.replace(/\r\n/g, '\n');

  // 1. Extract fenced code blocks ```lang ... ```
  working = working.replace(/```([a-zA-Z0-9_+#-]*)\n([\s\S]*?)```/g, (_match, rawLang, rawCode) => {
    const langLower = (rawLang || '').trim().toLowerCase();
    const trimmedCode = (rawCode || '').replace(/\n$/, '');
    const token = `@@WS_BOX_PLACEHOLDER_${placeholders.length}@@`;

    if (langLower === 'formula' || langLower === 'math' || langLower === 'calcolo' || langLower === 'latex') {
      const lines = trimmedCode
        .split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean);
      const boxes = lines.map((expr: string) => buildInteractiveFormulaBoxHtml(expr)).join('<br>');
      placeholders.push({ token, html: `<p>${boxes}</p>` });
    } else {
      const langId = normalizeCodeLanguageId(langLower);
      placeholders.push({
        token,
        html: buildHighlightedCodeBlockHtml(trimmedCode, langId)
      });
    }
    return `\n\n${token}\n\n`;
  });

  // 2. Extract block or inline math formulas $$ ... $$
  working = working.replace(/\$\$([^$\n]+)\$\$/g, (_match, expr) => {
    const token = `@@WS_BOX_PLACEHOLDER_${placeholders.length}@@`;
    placeholders.push({
      token,
      html: buildInteractiveFormulaBoxHtml(expr.trim())
    });
    return token;
  });

  // 3. Extract markdown blockquotes (> ...) into styled `.note-quote-block`
  working = working.replace(/(?:^|\n)((?:>\s?.+(?:\n|$))+)/g, (_match, quoteBlock) => {
    const cleanedQuote = quoteBlock
      .split('\n')
      .map((line: string) => line.replace(/^>\s?/, '').trim())
      .filter(Boolean)
      .join('<br>');
    if (!cleanedQuote) return _match;
    const token = `@@WS_BOX_PLACEHOLDER_${placeholders.length}@@`;
    placeholders.push({
      token,
      html: `<blockquote class="note-quote-block">${cleanedQuote}</blockquote><p><br></p>`
    });
    return `\n\n${token}\n\n`;
  });

  // 4. Render remaining markdown
  let html = '';
  if (markdownRenderer) {
    html = markdownRenderer(working);
  } else {
    html = working
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => (p.startsWith('@@WS_BOX_PLACEHOLDER_') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`))
      .join('');
  }

  // 5. Restore interactive box HTML placeholders (unwrap <p> around block-level placeholders if present)
  for (const { token, html: boxHtml } of placeholders) {
    const wrappedInP = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
    if (wrappedInP.test(html)) {
      html = html.replace(wrappedInP, boxHtml);
    } else {
      html = html.split(token).join(boxHtml);
    }
  }

  return html;
}

/**
 * Surgically updates an existing `.note-code-block`, `.note-formula-box`, or `blockquote` inside `noteHtml`
 * matching `targetBlockId` or `targetTopic` (or the most relevant box if only one exists).
 * Supports replacing either a partial snippet inside a code box (`partialOldSnippet` -> `newContent`)
 * or the entire box content!
 */
export function applyTargetedBoxReplacement(
  noteHtml: string,
  options: {
    boxType: 'code' | 'formula' | 'quote';
    targetTopic?: string | null;
    targetBlockId?: string | null;
    partialOldSnippet?: string | null;
    newContent: string;
    newLang?: string | null;
  }
): { updatedHtml: string; matched: boolean; matchedId?: string } {
  if (!noteHtml || typeof noteHtml !== 'string') {
    return { updatedHtml: noteHtml || '', matched: false };
  }

  const topicLower = (options.targetTopic || '').trim().toLowerCase();
  const topicWords = topicLower
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9_]/gi, ''))
    .filter(w => w.length >= 3 && !['blocco', 'codice', 'ciclo', 'funzione', 'parte', 'dove', 'faccio', 'calcolare', 'formula', 'citazione', 'nella', 'box'].includes(w));

  if (options.boxType === 'code') {
    const codeBlockRegex =
      /<div[^>]*class="[^"]*note-code-block[^"]*"[^>]*id="([^"]+)"[^>]*data-lang="([^"]+)"[^>]*data-raw="([^"]*)"[^>]*>[\s\S]*?<\/div><\/div>/gi;
    const matches: Array<{ fullMatch: string; id: string; lang: string; rawCode: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = codeBlockRegex.exec(noteHtml)) !== null) {
      let decoded = '';
      try {
        decoded = decodeURIComponent(m[3] || '');
      } catch {
        decoded = m[3] || '';
      }
      matches.push({
        fullMatch: m[0],
        id: m[1],
        lang: m[2] || 'javascript',
        rawCode: decoded
      });
    }

    if (matches.length === 0) {
      return { updatedHtml: noteHtml, matched: false };
    }

    // Choose target block by explicit ID, by topic keyword match in rawCode, or fallback to last/first code block
    let target = matches.find(b => options.targetBlockId && b.id === options.targetBlockId);
    if (!target && topicWords.length > 0) {
      target = matches.find(b => {
        const lowerCode = b.rawCode.toLowerCase();
        return topicWords.some(w => lowerCode.includes(w));
      });
    }
    if (!target) {
      target = matches[matches.length - 1];
    }

    let finalCode = options.newContent;
    if (options.partialOldSnippet && target.rawCode.includes(options.partialOldSnippet)) {
      finalCode = target.rawCode.replace(options.partialOldSnippet, options.newContent);
    }

    const finalLang = options.newLang ? normalizeCodeLanguageId(options.newLang) : target.lang;
    const replacementBlock = buildHighlightedCodeBlockHtml(finalCode, finalLang, target.id).replace(/<p><br><\/p>$/, '');
    const updatedHtml = noteHtml.replace(target.fullMatch, replacementBlock);
    return { updatedHtml, matched: true, matchedId: target.id };
  }

  if (options.boxType === 'formula') {
    const formulaRegex =
      /<span[^>]*class="[^"]*note-formula-box[^"]*"[^>]*id="([^"]+)"[^>]*data-formula="([^"]*)"[^>]*>[\s\S]*?<\/button><\/span>/gi;
    const matches: Array<{ fullMatch: string; id: string; expr: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = formulaRegex.exec(noteHtml)) !== null) {
      matches.push({
        fullMatch: m[0],
        id: m[1],
        expr: m[2] || ''
      });
    }
    if (matches.length === 0) {
      return { updatedHtml: noteHtml, matched: false };
    }
    let target = matches.find(b => options.targetBlockId && b.id === options.targetBlockId);
    if (!target && topicWords.length > 0) {
      target = matches.find(b => topicWords.some(w => b.expr.toLowerCase().includes(w)));
    }
    if (!target) target = matches[matches.length - 1];

    const replacementSpan = buildInteractiveFormulaBoxHtml(options.newContent, target.id).replace(/&nbsp;$/, '');
    const updatedHtml = noteHtml.replace(target.fullMatch, replacementSpan);
    return { updatedHtml, matched: true, matchedId: target.id };
  }

  if (options.boxType === 'quote') {
    const quoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    const matches: Array<{ fullMatch: string; inner: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = quoteRegex.exec(noteHtml)) !== null) {
      matches.push({ fullMatch: m[0], inner: m[1] });
    }
    if (matches.length === 0) {
      return { updatedHtml: noteHtml, matched: false };
    }
    let target = matches[matches.length - 1];
    if (topicWords.length > 0) {
      const found = matches.find(q => topicWords.some(w => q.inner.toLowerCase().includes(w)));
      if (found) target = found;
    }
    let finalQuote = options.newContent;
    if (options.partialOldSnippet && target.inner.includes(options.partialOldSnippet)) {
      finalQuote = target.inner.replace(options.partialOldSnippet, options.newContent);
    }
    const replacementQuote = `<blockquote class="note-quote-block">${finalQuote}</blockquote>`;
    const updatedHtml = noteHtml.replace(target.fullMatch, replacementQuote);
    return { updatedHtml, matched: true };
  }

  return { updatedHtml: noteHtml, matched: false };
}

/**
 * Detects whether a chat prompt is asking the AI to highlight key concepts or directly
 * modify/edit the user's current notes in `#notes-area` (including targeted edits inside a
 * `.note-code-block`, `.note-formula-box`, or `blockquote`), and extracts any specific
 * topic/section mentioned (e.g. "nel blocco di codice dove faccio il ciclo per calcolare fibonacci sistemalo e sostituiscilo gia nella box").
 */
export function parseAiNoteEditIntent(userMessage: string): {
  isDirectNoteEdit: boolean;
  mode: 'highlight' | 'edit' | 'edit_code_box' | 'edit_formula_box' | 'edit_quote_box' | 'none';
  targetTopic: string | null;
} {
  if (!userMessage || typeof userMessage !== 'string') {
    return { isDirectNoteEdit: false, mode: 'none', targetTopic: null };
  }
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  // 1. Check for targeted Code Box / Formula Box / Quote Box edit & replace commands
  const hasBoxEditVerb =
    /\b(sistema\w*|sostituisci\w*|correggi\w*|modifica\w*|aggiorna\w*|aggiusta\w*|cambia\w*|ottimizza\w*|riscrivi\w*|metti\s+a\s+posto|fixa\w*)\b/i.test(
      lower
    );
  const mentionsCodeBox =
    /\b(blocco\s+(?:di\s+)?codice|box\s+(?:di\s+)?codice|nella\s+box|nel\s+codice|blocco\s+python|blocco\s+javascript|blocco\s+sql|blocco\s+bash|blocco\s+c\+\+|blocco\s+java|ciclo\s+per|funzione\s+per)\b/i.test(
      lower
    );
  const mentionsFormulaBox =
    /\b(blocco\s+formula|box\s+formula|nella\s+formula|la\s+formula\s+dove|formula\s+nella\s+box)\b/i.test(lower);
  const mentionsQuoteBox =
    /\b(blocco\s+citazione|box\s+citazione|nella\s+citazione|la\s+citazione\s+dove)\b/i.test(lower);

  if (hasBoxEditVerb && (mentionsCodeBox || mentionsFormulaBox || mentionsQuoteBox)) {
    let targetTopic: string | null = null;
    const boxTopicMatch =
      text.match(
        /(?:dove\s+(?:faccio|c'è|calcolo|parlo\s+di|scrivo|ho\s+scritto)|per\s+calcolare|che\s+calcola|riguardo\s+a|sulla\s+parte\s+di)\s+([^.,;!?]+?)(?:\s+(?:sistem\w*|sostituisc\w*|corregg\w*|modific\w*|aggiorn\w*|e\s+sostituisc\w*)|$)/i
      ) ||
      text.match(/(?:ciclo|funzione|query|formula|citazione)\s+(?:per|di|su)\s+([^.,;!?]+?)(?:\s+(?:sistem\w*|sostituisc\w*|corregg\w*)|$)/i);

    if (boxTopicMatch && boxTopicMatch[1]) {
      targetTopic = boxTopicMatch[1].trim();
    } else {
      targetTopic = text;
    }

    const mode = mentionsFormulaBox
      ? 'edit_formula_box'
      : mentionsQuoteBox
      ? 'edit_quote_box'
      : 'edit_code_box';

    return {
      isDirectNoteEdit: true,
      mode,
      targetTopic
    };
  }

  // 2. Check for highlight keywords
  const hasHighlightVerb =
    /\b(evidenzia\w*|sottolinea\w*|colora\w*|metti in evidenza|marca\w*)\b/i.test(lower);

  // 3. Check for direct note edit keywords
  const hasNoteEditPhrase =
    /\b(modifica\s+gli\s+appunti|aggiorna\s+gli\s+appunti|riscrivi\s+gli\s+appunti|formatta\s+gli\s+appunti|negli\s+appunti\s+evidenzia|negli\s+appunti\s+modifica|correggi\s+gli\s+appunti|aggiungi\s+negli\s+appunti|inserisci\s+negli\s+appunti)\b/i.test(
      lower
    );

  if (!hasHighlightVerb && !hasNoteEditPhrase) {
    return { isDirectNoteEdit: false, mode: 'none', targetTopic: null };
  }

  // Extract optional target topic, e.g. "dove parlo delle select", "sulla parte di join", "riguardo a ..."
  let targetTopic: string | null = null;
  const topicPatterns = [
    /(?:dove\s+parl[oa]\s+(?:di|del|della|dei|degli|delle|dello)|parte\s+(?:su|sul|sulla|sui|sugli|sulle|di|del|della|dei|degli|delle)|riguardo\s+(?:a|al|alla|ai|agli|alle)|sezione\s+(?:su|di|del|della|delle))\s+([^.,;!?]+)/i,
    /evidenzia(?:re)?\s+(?:le\s+parti\s+importanti\s+|i\s+concetti\s+chiave\s+|le\s+cose\s+importanti\s+|le\s+robe\s+chiave\s+)?(?:su|sul|sulla|sui|sulle|di|del|della|delle)\s+([^.,;!?]+)/i
  ];

  for (const pat of topicPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      const candidate = m[1].trim();
      if (
        candidate &&
        !/^(appunti|testo|pagina|tutto|nota|note)$/i.test(candidate)
      ) {
        targetTopic = candidate;
        break;
      }
    }
  }

  return {
    isDirectNoteEdit: true,
    mode: hasHighlightVerb ? 'highlight' : 'edit',
    targetTopic
  };
}

// ============================================================================
// SVG FREEHAND DRAWING HELPERS (PEN, HIGHLIGHTER, ARROW, LINE, RECT)
// ============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export function buildSvgElementString(
  tool: 'pen' | 'highlighter' | 'arrow' | 'line' | 'rect',
  points: Point2D[],
  color: string,
  strokeWidth: number
): string {
  if (!points || points.length === 0) return '';
  const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (tool === 'pen' || tool === 'highlighter') {
    if (points.length === 1) {
      const p = points[0];
      const r = Math.max(2, strokeWidth / 2);
      const opacity = tool === 'highlighter' ? '0.38' : '1';
      return `<circle id="${strokeId}" data-stroke="true" data-draw-item="true" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${color}" opacity="${opacity}" />`;
    }
    const d = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const width = tool === 'highlighter' ? Math.max(14, strokeWidth * 2.6) : strokeWidth;
    const opacity = tool === 'highlighter' ? '0.36' : '0.96';
    return `<path id="${strokeId}" data-stroke="true" data-draw-item="true" d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />`;
  }

  const start = points[0];
  const end = points[points.length - 1];

  if (tool === 'line') {
    return `<line id="${strokeId}" data-stroke="true" data-draw-item="true" x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" />`;
  }

  if (tool === 'rect') {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.max(4, Math.abs(end.x - start.x));
    const h = Math.max(4, Math.abs(end.y - start.y));
    return `<rect id="${strokeId}" data-stroke="true" data-draw-item="true" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />`;
  }

  if (tool === 'arrow') {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const headLen = Math.max(10, strokeWidth * 3.2);
    const x1 = end.x - headLen * Math.cos(angle - Math.PI / 6);
    const y1 = end.y - headLen * Math.sin(angle - Math.PI / 6);
    const x2 = end.x - headLen * Math.cos(angle + Math.PI / 6);
    const y2 = end.y - headLen * Math.sin(angle + Math.PI / 6);
    const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)} M ${end.x.toFixed(1)} ${end.y.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} M ${end.x.toFixed(1)} ${end.y.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    return `<path id="${strokeId}" data-stroke="true" data-draw-item="true" d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  return '';
}

// ============================================================================
// NATURAL-LANGUAGE CALENDAR CHAT ASSISTANT (ADD REMINDERS & QUERY SCHEDULE)
// ============================================================================

export interface ParsedCalendarCommand {
  isAddCommand: boolean;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  category: 'lecture' | 'homework' | 'study' | 'exam';
  subject: string;
  description: string;
  readableDateIt: string;
}

const ITALIAN_MONTHS_MAP: Record<string, number> = {
  gennaio: 1,
  gen: 1,
  febbraio: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  aprile: 4,
  apr: 4,
  maggio: 5,
  mag: 5,
  giugno: 6,
  giu: 6,
  luglio: 7,
  lug: 7,
  agosto: 8,
  ago: 8,
  settembre: 9,
  set: 9,
  ottobre: 10,
  ott: 10,
  novembre: 11,
  nov: 11,
  dicembre: 12,
  dic: 12
};

const ITALIAN_WEEKDAYS_MAP: Record<string, number> = {
  domenica: 0,
  lunedi: 1,
  'lunedì': 1,
  martedi: 2,
  'martedì': 2,
  mercoledi: 3,
  'mercoledì': 3,
  giovedi: 4,
  'giovedì': 4,
  venerdi: 5,
  'venerdì': 5,
  sabato: 6
};

const WEEKDAY_NAMES_FULL_IT = [
  'Domenica',
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato'
];

const MONTH_NAMES_FULL_IT = [
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

function toIsoDateLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatItalianDateNice(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return dateStr;
  return `${WEEKDAY_NAMES_FULL_IT[d.getDay()]} ${Number(parts[2])} ${MONTH_NAMES_FULL_IT[d.getMonth()]} ${d.getFullYear()}`;
}

export function resolveItalianDateFromText(text: string, now: Date = new Date()): string | null {
  const lower = text.toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/\bdopodomani\b/.test(lower)) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2);
    return toIsoDateLocal(d);
  }
  if (/\bdomani\b/.test(lower)) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
    return toIsoDateLocal(d);
  }
  if (/\b(oggi|stasera|stamattina)\b/i.test(lower)) {
    return toIsoDateLocal(base);
  }

  // ISO YYYY-MM-DD
  const isoMatch = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD/MM
  const slashMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const m = Number(slashMatch[2]);
    let y = slashMatch[3] ? Number(slashMatch[3]) : base.getFullYear();
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // "20 novembre" / "il 5 dicembre"
  const monthNamesPattern = Object.keys(ITALIAN_MONTHS_MAP).join('|');
  const namedMonthRegex = new RegExp(`\\b(\\d{1,2})\\s+(${monthNamesPattern})(?:\\s+(20\\d{2}))?\\b`, 'i');
  const namedMatch = lower.match(namedMonthRegex);
  if (namedMatch) {
    const day = Number(namedMatch[1]);
    const m = ITALIAN_MONTHS_MAP[namedMatch[2].toLowerCase()];
    const y = namedMatch[3] ? Number(namedMatch[3]) : base.getFullYear();
    if (m && day >= 1 && day <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Weekday names ("lunedì", "martedì", "venerdì prossimo", etc.)
  for (const [wName, targetDow] of Object.entries(ITALIAN_WEEKDAYS_MAP)) {
    const wRegex = new RegExp(`\\b${wName}\\b`, 'i');
    if (wRegex.test(lower)) {
      const currentDow = base.getDay();
      let diff = (targetDow - currentDow + 7) % 7;
      if (diff === 0) diff = 7;
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff);
      return toIsoDateLocal(d);
    }
  }

  return null;
}

/**
 * Parses natural-language Italian chat prompts asking to add a reminder, homework, exam, or lecture to the calendar.
 */
export function parseCalendarChatCommand(
  userMessage: string,
  availableSubjects: string[] = ['Database'],
  now: Date = new Date()
): ParsedCalendarCommand | null {
  if (!userMessage || typeof userMessage !== 'string') return null;
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  const hasAddVerb =
    /\b(aggiungi|metti|crea|segna|ricordami|pianifica|programma|inserisci|fissa|imposta)\b/i.test(lower);
  const hasCalendarTarget =
    /\b(promemoria|calendario|impegno|evento|verifica|esame|compito|consegna|lezione|studio|ripasso|test|interrogazione)\b/i.test(
      lower
    );

  // Exclude note-editing commands like "aggiungi negli appunti"
  if (/\b(negli\s+appunti|nella\s+nota|nella\s+pagina|tabella\s+negli\s+appunti)\b/i.test(lower)) {
    return null;
  }

  if (!hasAddVerb || !hasCalendarTarget) {
    return null;
  }

  const resolvedDate = resolveItalianDateFromText(text, now) || toIsoDateLocal(now);

  let startTime = '09:00';
  let endTime = '10:00';

  const rangeMatch = lower.match(
    /\bdalle\s+(\d{1,2})(?:[:.](\d{2}))?\s+alle\s+(\d{1,2})(?:[:.](\d{2}))?\b/i
  );
  const singleTimeMatch = lower.match(/\b(?:alle|ore|per\s+le)\s+(\d{1,2})(?:[:.](\d{2}))?\b/i);

  if (rangeMatch) {
    const sh = Math.min(23, Math.max(0, Number(rangeMatch[1])));
    const sm = Math.min(59, Math.max(0, Number(rangeMatch[2] || '0')));
    const eh = Math.min(23, Math.max(0, Number(rangeMatch[3])));
    const em = Math.min(59, Math.max(0, Number(rangeMatch[4] || '0')));
    startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  } else if (singleTimeMatch) {
    const sh = Math.min(23, Math.max(0, Number(singleTimeMatch[1])));
    const sm = Math.min(59, Math.max(0, Number(singleTimeMatch[2] || '0')));
    const eh = (sh + 1) % 24;
    startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    endTime = `${String(eh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
  }

  let category: 'lecture' | 'homework' | 'study' | 'exam' = 'study';
  if (/\b(esame|verifica|test|parziale|interrogazione|orale|scritto)\b/i.test(lower)) {
    category = 'exam';
  } else if (/\b(compito|consegna|scadenza|progetto|esercizi|relazione)\b/i.test(lower)) {
    category = 'homework';
  } else if (/\b(lezione|corso|laboratorio)\b/i.test(lower)) {
    category = 'lecture';
  } else {
    category = 'study';
  }

  let matchedSubject = availableSubjects[0] || 'Generale';
  for (const sub of availableSubjects) {
    if (sub && lower.includes(sub.toLowerCase())) {
      matchedSubject = sub;
      break;
    }
  }

  const monthNamesPattern = Object.keys(ITALIAN_MONTHS_MAP).join('|');
  let rawTitle = text
    .replace(
      /^(?:per\s+favore\s+|ehi\s+|ciao\s+)?(?:aggiungi|metti|crea|segna|ricordami|pianifica|programma|inserisci|fissa|imposta)\s+(?:un\s+|una\s+|il\s+|la\s+)?(?:promemoria|evento|impegno|nel\s+calendario|in\s+calendario|sul\s+calendario)?\s*/i,
      ''
    )
    .replace(/\b(?:nel\s+calendario|in\s+calendario|sul\s+calendario)\b/gi, '')
    .replace(/\bdalle\s+\d{1,2}(?:[:.]\d{2})?\s+alle\s+\d{1,2}(?:[:.]\d{2})?\b/gi, '')
    .replace(/\b(?:alle|ore|per\s+le)\s+\d{1,2}(?:[:.]\d{2})?\b/gi, '')
    .replace(/\b(?:per\s+)?(?:oggi|domani|dopodomani|stasera|stamattina)\b/gi, '')
    .replace(
      /\b(?:per\s+|di\s+|il\s+)?(?:luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)(?:\s+prossim[oa])?\b/gi,
      ''
    )
    .replace(/\b(?:per\s+il\s+|il\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, '')
    .replace(
      new RegExp(`\\b(?:per\\s+il\\s+|il\\s+)?\\d{1,2}\\s+(?:${monthNamesPattern})(?:\\s+20\\d{2})?\\b`, 'gi'),
      ''
    )
    .replace(/^(?:\s*(?:per|di|che|su|a|:|-)\s+)+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!rawTitle) {
    rawTitle =
      category === 'exam'
        ? `Verifica di ${matchedSubject}`
        : category === 'homework'
        ? `Compito di ${matchedSubject}`
        : category === 'lecture'
        ? `Lezione di ${matchedSubject}`
        : `Promemoria ${matchedSubject}`;
  } else {
    rawTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  }

  return {
    isAddCommand: true,
    title: rawTitle,
    date: resolvedDate,
    startTime,
    endTime,
    category,
    subject: matchedSubject,
    description: `Creato tramite assistente Chat: "${text}"`,
    readableDateIt: formatItalianDateNice(resolvedDate)
  };
}

/**
 * Builds a structured Italian summary of the user's Calendar events to inject into Gemini Copilot's system prompt
 * so Gemini can answer any question about the user's classes, subjects, exams, and schedule.
 */
export function buildCalendarScheduleContextForChat(
  events: Array<{
    id: string;
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    category: string;
    subject: string;
    description?: string;
    completed?: boolean;
  }>,
  now: Date = new Date()
): string {
  const todayStr = toIsoDateLocal(now);
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = toIsoDateLocal(tomorrowDate);

  const header = `[CALENDARIO STUDI & LEZIONI DELL'UTENTE — Data di oggi: ${formatItalianDateNice(todayStr)} (${todayStr}), Domani: ${formatItalianDateNice(tomorrowStr)} (${tomorrowStr})]`;

  if (!events || events.length === 0) {
    return `${header}\nNessun evento o lezione attualmente presente nel calendario.`;
  }

  const sorted = [...events].sort((a, b) =>
    `${a.date} ${a.startTime || '09:00'}`.localeCompare(`${b.date} ${b.startTime || '09:00'}`)
  );

  const relevant = sorted.filter(e => e.date >= todayStr).slice(0, 60);
  if (relevant.length === 0) {
    return `${header}\nNessun impegno futuro a partire da oggi (${todayStr}).`;
  }

  const lines = relevant.map(ev => {
    const niceDay = formatItalianDateNice(ev.date);
    const tag =
      ev.date === todayStr ? '[OGGI] ' : ev.date === tomorrowStr ? '[DOMANI] ' : '';
    const status = ev.completed ? ' (Completato)' : '';
    const desc = ev.description ? ` — Note: ${ev.description}` : '';
    return `- ${tag}${niceDay} (${ev.date}) dalle ${ev.startTime || '09:00'} alle ${ev.endTime || '10:00'} | Materia: ${ev.subject} | Titolo: ${ev.title} [${ev.category}]${status}${desc}`;
  });

  return `${header}\nElenco lezioni, materie, compiti ed esami in calendario:\n${lines.join('\n')}\n\n(Se l'utente ti chiede che materie/lezioni ha domani, oggi o in un giorno specifico, rispondi elencando con precisione gli orari e le materie qui sopra.)`;
}

/**
 * Answers direct calendar questions locally (e.g. "che materie ho domani?", "cosa ho in calendario oggi?")
 * so the user gets an instant, accurate answer even without an API key or alongside Gemini.
 */
export function answerCalendarQueryLocally(
  userMessage: string,
  events: Array<{
    id: string;
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    category: string;
    subject: string;
    description?: string;
    completed?: boolean;
  }>,
  now: Date = new Date()
): { isCalendarQuery: boolean; replyMarkdown: string } {
  if (!userMessage || typeof userMessage !== 'string') {
    return { isCalendarQuery: false, replyMarkdown: '' };
  }
  const lower = userMessage.trim().toLowerCase();

  const isQuestionAboutSchedule =
    /\b(che\s+materie|quali\s+materie|che\s+lezioni|quali\s+lezioni|cosa\s+ho|che\s+impegni|quali\s+impegni|che\s+esami|che\s+verifiche|cosa\s+c'è\s+in\s+calendario|programma\s+di\s+(?:oggi|domani|dopodomani|luned|marted|mercoled|gioved|venerd|sabato|domenica))\b/i.test(
      lower
    );

  if (!isQuestionAboutSchedule) {
    return { isCalendarQuery: false, replyMarkdown: '' };
  }

  const targetDate = resolveItalianDateFromText(userMessage, now) || toIsoDateLocal(now);
  const niceDate = formatItalianDateNice(targetDate);
  const dayEvents = (events || [])
    .filter(e => e.date === targetDate)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  if (dayEvents.length === 0) {
    return {
      isCalendarQuery: true,
      replyMarkdown: `📅 Per **${niceDate}** (${targetDate}) non risultano lezioni o impegni registrati nel tuo Calendario.`
    };
  }

  const rows = dayEvents.map(
    ev =>
      `• **${ev.startTime || '09:00'} – ${ev.endTime || '10:00'}** — **${ev.title}** *(Materia: ${ev.subject})*${
        ev.description ? ` — ${ev.description}` : ''
      }`
  );

  return {
    isCalendarQuery: true,
    replyMarkdown: `📅 Ecco i tuoi impegni e le materie per **${niceDate}**:\n\n${rows.join('\n')}`
  };
}
