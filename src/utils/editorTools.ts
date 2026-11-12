/**
 * Editor Utilities:
 * - Safe Math & Formula Evaluator (inline calculations & formula toolbox)
 * - Multi-language Syntax Highlighter for Note Code Blocks
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
    label: 'JavaScript / TypeScript',
    badge: 'JS / TS',
    sample: 'function calcolaMedia(voti) {\n  const somma = voti.reduce((a, b) => a + b, 0);\n  return somma / voti.length;\n}'
  },
  {
    id: 'python',
    label: 'Python',
    badge: 'PYTHON',
    sample: 'def filtra_studenti(lista, voto_min=18):\n    # Restituisce gli studenti promossi\n    return [s for s in lista if s["voto"] >= voto_min]'
  },
  {
    id: 'sql',
    label: 'SQL / Database',
    badge: 'SQL',
    sample: 'SELECT s.nome, s.cognome, AVG(e.voto) AS media\nFROM studenti s\nJOIN esami e ON s.id = e.studente_id\nWHERE e.voto >= 18\nGROUP BY s.id\nORDER BY media DESC;'
  },
  {
    id: 'html',
    label: 'HTML / CSS',
    badge: 'HTML / CSS',
    sample: '<div class="card-container">\n  <h2>Titolo Sezione</h2>\n  <p>Contenuto dell\'elemento</p>\n</div>'
  },
  {
    id: 'java',
    label: 'Java / C#',
    badge: 'JAVA / C#',
    sample: 'public class Studente {\n    private String nome;\n    public Studente(String nome) {\n        this.nome = nome;\n    }\n}'
  },
  {
    id: 'cpp',
    label: 'C / C++',
    badge: 'C / C++',
    sample: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Workspace ITS" << endl;\n    return 0;\n}'
  },
  {
    id: 'php',
    label: 'PHP',
    badge: 'PHP',
    sample: '<?php\n$utente = ["nome" => "Mario", "ruolo" => "Studente"];\necho "Benvenuto " . $utente["nome"];\n?>'
  },
  {
    id: 'bash',
    label: 'Bash / Terminale / Linux',
    badge: 'BASH',
    sample: '#!/bin/bash\ndocker compose up -d --build\ngit status && git log -n 5 --oneline'
  },
  {
    id: 'json',
    label: 'JSON / Configurazione',
    badge: 'JSON',
    sample: '{\n  "corso": "Sviluppo Cloud & Database",\n  "anno": 2026,\n  "attivo": true\n}'
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
 * Returns formatted number string or null if invalid.
 */
export function evaluateMathExpression(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let expr = raw
    .trim()
    .replace(/=$/, '')
    .trim()
    // Normalize symbols
    .replace(/×/g, '*')
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
  if (!/pow\s*\(/i.test(expr)) {
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

  const tokenized = expr.replace(/\b(sqrt|sin|cos|tan|asin|acos|atan|abs|round|floor|ceil|log|ln|exp|pow|min|max|PI|E)\b/g, match => {
    return mathMap[match] || match;
  });

  // Security validation: after replacing Math.* tokens, only digits, operators, parens, dots, commas, and spaces may remain
  const stripped = tokenized.replace(/Math\.(sqrt|sin|cos|tan|asin|acos|atan|abs|round|floor|ceil|log10|log|exp|pow|min|max|PI|E)/g, '');
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

function escapeHtml(str: string): string {
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

  // Combined single-pass regex to avoid nested span corruption:
  // Group 1: Comments (//..., /*...*/, #..., --...)
  // Group 2: Strings ("...", '...', `...`)
  // Group 3: Numbers (\b\d+(?:\.\d+)?\b)
  // Group 4: Words / Identifiers (\b[A-Za-z_][A-Za-z0-9_]*\b)
  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|--[^\n]*)|(&quot;(?:\\.|[^&])*?&quot;|'(?:\\.|[^'])*?'|`(?:\\.|[^`])*?`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

  const jsKeywords = new Set([
    'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'class', 'extends', 'new', 'import', 'from',
    'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof',
    'interface', 'type', 'implements', 'public', 'private', 'protected', 'static', 'readonly'
  ]);
  const pyKeywords = new Set([
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and',
    'or', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda',
    'yield', 'pass', 'break', 'continue', 'global', 'nonlocal', 'assert', 'async', 'await'
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
    'std', 'cout', 'cin', 'endl', 'try', 'catch', 'throw', 'override', 'virtual'
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
 * Generates the HTML snippet for a syntax-highlighted code block inside #notes-area
 */
export function buildHighlightedCodeBlockHtml(code: string, languageId: string): string {
  const langObj = CODE_LANGUAGES.find(l => l.id === languageId) || CODE_LANGUAGES[0];
  const highlighted = highlightCodeSyntax(code, langObj.id);
  const encodedRaw = encodeURIComponent(code);

  return `
<div class="note-code-block" data-lang="${langObj.id}" data-raw="${encodedRaw}" contenteditable="false">
  <div class="note-code-header">
    <span class="note-code-lang-badge">${langObj.badge}</span>
    <div class="note-code-actions">
      <button type="button" class="note-code-copy-btn" data-copy-code="true">📋 Copia Codice</button>
    </div>
  </div>
  <pre class="note-code-pre" contenteditable="true" spellcheck="false"><code>${highlighted}</code></pre>
</div><p><br></p>`;
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
