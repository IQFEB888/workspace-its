import { callGeminiWithRotation, normalizeGeminiModelName } from './geminiService';
import { executeSqlLocally, formatAsciiTable } from '../utils/sqlEngine';

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  durationMs: number;
  engineLabel: string;
  isHtmlPreview?: boolean;
  htmlContent?: string;
}

const WANDBOX_COMPILERS: Record<string, string> = {
  python: 'cpython-3.12.7',
  cpp: 'gcc-13.2.0',
  java: 'openjdk-22+36',
  php: 'php-8.3.12',
  // On Wandbox, real GNU /bin/bash runs inside the Linux container via cpython-3.12.7 subprocess
  bash: 'cpython-3.12.7'
};

function formatConsoleArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

/**
 * Executes JavaScript/TypeScript directly inside an isolated browser Function sandbox.
 */
function runJavaScriptInBrowser(rawCode: string): CodeExecutionResult {
  const start = performance.now();
  const logs: string[] = [];
  const errors: string[] = [];

  // Strip basic TypeScript type annotations if user wrote TS syntax in JS/TS block
  const jsCode = rawCode
    .replace(/:\s*(?:string|number|boolean|any|void|unknown|never)(?:\[\])?(?=[,\)\s=;])/g, '')
    .replace(/\binterface\s+[A-Za-z0-9_]+\s*\{[\s\S]*?\}/g, '');

  const customConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatConsoleArg).join(' ')),
    info: (...args: unknown[]) => logs.push('ℹ️ ' + args.map(formatConsoleArg).join(' ')),
    warn: (...args: unknown[]) => logs.push('⚠️ ' + args.map(formatConsoleArg).join(' ')),
    error: (...args: unknown[]) => errors.push('❌ ' + args.map(formatConsoleArg).join(' ')),
    table: (data: unknown) => logs.push(formatConsoleArg(data))
  };

  try {
    // eslint-disable-next-line no-new-func
    const runner = new Function('console', `"use strict";\n${jsCode}`);
    const returnVal = runner(customConsole);
    if (returnVal !== undefined) {
      logs.push(`↵ Return: ${formatConsoleArg(returnVal)}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    errors.push(msg);
  }

  const durationMs = Math.max(1, Math.round(performance.now() - start));
  return {
    stdout: logs.join('\n') || (errors.length === 0 ? '(Codice eseguito senza output in console)' : ''),
    stderr: errors.join('\n'),
    durationMs,
    engineLabel: 'Browser JS Engine (Locale • Zero Key)'
  };
}

/**
 * Lightweight, fast local Bash / Shell interpreter for common educational scripts
 * (variables, arithmetic $((...)), C-style for ((...)), for..in..do..done, while..do..done, if..then..fi, echo, printf, seq).
 * Returns null if the script uses advanced external Linux commands so it can run on the Linux sandbox.
 */
export function runBashLocally(rawCode: string): CodeExecutionResult | null {
  const start = performance.now();
  // If script uses advanced Linux pipes/tools not emulated locally, let Wandbox GNU Bash handle it
  if (/\b(awk|sed|curl|wget|grep|find|xargs|tar|gzip|chmod|chown|ps|kill|apt|yum|git|docker|ssh|scp)\b/.test(rawCode)) {
    return null;
  }

  const vars: Record<string, string | number> = {};
  const outLines: string[] = [];
  let currentLineBuf = '';

  const evalArith = (exprStr: string): number => {
    const expanded = exprStr.replace(/\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (_m, v1, v2) => {
      const name = v1 || v2;
      const val = vars[name];
      return val !== undefined && !isNaN(Number(val)) ? String(Number(val)) : '0';
    });
    if (!/^[0-9+\-*/%()<>=!&|\s?:]+$/.test(expanded)) return 0;
    try {
      // eslint-disable-next-line no-new-func
      const res = new Function(`return (${expanded});`)();
      return typeof res === 'boolean' ? (res ? 1 : 0) : Math.trunc(Number(res) || 0);
    } catch {
      return 0;
    }
  };

  const expandString = (str: string): string => {
    let s = str;
    // Expand $(( ... ))
    s = s.replace(/\$\(\(([\s\S]*?)\)\)/g, (_m, expr) => String(evalArith(expr)));
    // Expand $(seq a b)
    s = s.replace(/\$\(\s*seq\s+(-?\d+)\s+(-?\d+)(?:\s+(-?\d+))?\s*\)/g, (_m, a, b, c) => {
      const startN = Number(a);
      const stepN = c !== undefined ? Number(b) : 1;
      const endN = c !== undefined ? Number(c) : Number(b);
      const list: number[] = [];
      if (stepN > 0) {
        for (let i = startN; i <= endN && list.length < 500; i += stepN) list.push(i);
      } else if (stepN < 0) {
        for (let i = startN; i >= endN && list.length < 500; i += stepN) list.push(i);
      }
      return list.join(' ');
    });
    // Expand ${var} and $var
    s = s.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}|\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, v1, v2) => {
      const name = v1 || v2;
      return vars[name] !== undefined ? String(vars[name]) : '';
    });
    return s;
  };

  const evalCondition = (condRaw: string): boolean => {
    const c = condRaw.trim();
    const arithMatch = c.match(/^\(\(([\s\S]*)\)\)$/);
    if (arithMatch) {
      return evalArith(arithMatch[1]) !== 0;
    }
    const bracketMatch = c.match(/^\[{1,2}\s*([\s\S]*?)\s*\]{1,2}$/);
    const inner = bracketMatch ? bracketMatch[1].trim() : c;
    const expanded = expandString(inner);

    const numCmp = expanded.match(/^(-?\d+)\s+(-eq|-ne|-lt|-le|-gt|-ge|==|!=|<=|>=|<|>)\s+(-?\d+)$/);
    if (numCmp) {
      const a = Number(numCmp[1]);
      const op = numCmp[2];
      const b = Number(numCmp[3]);
      if (op === '-eq' || op === '==') return a === b;
      if (op === '-ne' || op === '!=') return a !== b;
      if (op === '-lt' || op === '<') return a < b;
      if (op === '-le' || op === '<=') return a <= b;
      if (op === '-gt' || op === '>') return a > b;
      if (op === '-ge' || op === '>=') return a >= b;
    }
    const strCmp = expanded.match(/^"?([^"=!]*)"?\s*(=|==|!=)\s*"?([^"=!]*)"?$/);
    if (strCmp) {
      return strCmp[2] === '!=' ? strCmp[1].trim() !== strCmp[3].trim() : strCmp[1].trim() === strCmp[3].trim();
    }
    return Boolean(expanded);
  };

  // Normalize semicolons before `do` / `then` into newlines so block parsing is clean
  const rawLines = rawCode
    .replace(/\r\n/g, '\n')
    .replace(/;\s*(do|then)\b/g, '\n$1')
    .split('\n')
    .map(l => l.replace(/#.*$/, '').trim())
    .filter(l => l.length > 0 && !l.startsWith('!'));

  let stepCount = 0;
  const MAX_STEPS = 2500;

  const execBlock = (lines: string[]): boolean => {
    let i = 0;
    while (i < lines.length) {
      if (++stepCount > MAX_STEPS) return false;
      const line = lines[i];

      // 1. C-style for loop: for (( i=0; i<10; i++ ))
      const cForMatch = line.match(/^for\s+\(\(\s*([^;]+);\s*([^;]+);\s*([^)]+)\)\)\s*$/);
      if (cForMatch) {
        let depth = 0;
        let endIdx = -1;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^(for|while|until)\b/.test(lines[j])) depth++;
          if (lines[j] === 'done') {
            if (depth === 0) {
              endIdx = j;
              break;
            }
            depth--;
          }
        }
        if (endIdx === -1) return false;
        const body = lines.slice(i + 1, endIdx).filter(l => l !== 'do');

        // Init
        const initParts = cForMatch[1].split(',').map(s => s.trim());
        for (const p of initParts) {
          const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
          if (m) vars[m[1]] = evalArith(m[2]);
        }

        while (evalArith(cForMatch[2]) !== 0) {
          if (++stepCount > MAX_STEPS) return false;
          if (!execBlock(body)) return false;
          const incParts = cForMatch[3].split(',').map(s => s.trim());
          for (const inc of incParts) {
            const pp = inc.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+\+|--)$/) || inc.match(/^(\+\+|--)([a-zA-Z_][a-zA-Z0-9_]*)$/);
            if (pp) {
              const vName = pp[1] === '++' || pp[1] === '--' ? pp[2] : pp[1];
              const op = pp[1] === '++' || pp[2] === '++' ? 1 : -1;
              vars[vName] = Number(vars[vName] || 0) + op;
            } else {
              const plusEq = inc.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*([+\-*/])=\s*(.+)$/);
              if (plusEq) {
                const cur = Number(vars[plusEq[1]] || 0);
                const rhs = evalArith(plusEq[3]);
                vars[plusEq[1]] =
                  plusEq[2] === '+' ? cur + rhs : plusEq[2] === '-' ? cur - rhs : plusEq[2] === '*' ? cur * rhs : Math.trunc(cur / (rhs || 1));
              } else {
                const assign = inc.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
                if (assign) vars[assign[1]] = evalArith(assign[2]);
              }
            }
          }
        }
        i = endIdx + 1;
        continue;
      }

      // 2. Standard `for var in ...` loop
      const forInMatch = line.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.+)$/);
      if (forInMatch) {
        let depth = 0;
        let endIdx = -1;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^(for|while|until)\b/.test(lines[j])) depth++;
          if (lines[j] === 'done') {
            if (depth === 0) {
              endIdx = j;
              break;
            }
            depth--;
          }
        }
        if (endIdx === -1) return false;
        const body = lines.slice(i + 1, endIdx).filter(l => l !== 'do');
        const varName = forInMatch[1];
        const rawItems = forInMatch[2].trim();
        let items: string[] = [];
        const braceRange = rawItems.match(/^\{(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?\}$/);
        if (braceRange) {
          const s = Number(braceRange[1]);
          const e = Number(braceRange[2]);
          const step = braceRange[3] ? Number(braceRange[3]) : s <= e ? 1 : -1;
          if (step > 0) {
            for (let k = s; k <= e && items.length < 500; k += step) items.push(String(k));
          } else if (step < 0) {
            for (let k = s; k >= e && items.length < 500; k += step) items.push(String(k));
          }
        } else {
          items = expandString(rawItems).split(/\s+/).filter(Boolean);
        }

        for (const item of items) {
          vars[varName] = item.replace(/^["']|["']$/g, '');
          if (!execBlock(body)) return false;
        }
        i = endIdx + 1;
        continue;
      }

      // 3. `while ...` loop
      const whileMatch = line.match(/^while\s+(.+)$/);
      if (whileMatch) {
        let depth = 0;
        let endIdx = -1;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^(for|while|until)\b/.test(lines[j])) depth++;
          if (lines[j] === 'done') {
            if (depth === 0) {
              endIdx = j;
              break;
            }
            depth--;
          }
        }
        if (endIdx === -1) return false;
        const body = lines.slice(i + 1, endIdx).filter(l => l !== 'do');
        while (evalCondition(whileMatch[1])) {
          if (++stepCount > MAX_STEPS) return false;
          if (!execBlock(body)) return false;
        }
        i = endIdx + 1;
        continue;
      }

      // 4. `if ...` block
      const ifMatch = line.match(/^if\s+(.+)$/);
      if (ifMatch) {
        let depth = 0;
        let endIdx = -1;
        let elseIdx = -1;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^if\b/.test(lines[j])) depth++;
          if (lines[j] === 'else' && depth === 0 && elseIdx === -1) elseIdx = j;
          if (lines[j] === 'fi') {
            if (depth === 0) {
              endIdx = j;
              break;
            }
            depth--;
          }
        }
        if (endIdx === -1) return false;
        if (evalCondition(ifMatch[1])) {
          const thenBody = lines.slice(i + 1, elseIdx !== -1 ? elseIdx : endIdx).filter(l => l !== 'then');
          if (!execBlock(thenBody)) return false;
        } else if (elseIdx !== -1) {
          const elseBody = lines.slice(elseIdx + 1, endIdx).filter(l => l !== 'then');
          if (!execBlock(elseBody)) return false;
        }
        i = endIdx + 1;
        continue;
      }

      if (line === 'do' || line === 'then' || line === 'done' || line === 'fi') {
        i++;
        continue;
      }

      // 5. Multiple assignments or statements separated by `;` on the same line
      if (line.includes(';') && !/^echo\b|^printf\b/.test(line)) {
        const subStmts = line.split(';').map(s => s.trim()).filter(Boolean);
        if (subStmts.length > 1) {
          if (!execBlock(subStmts)) return false;
          i++;
          continue;
        }
      }

      // 6. Variable assignment: `a=0` or `local a=0` or `export a=0`
      const assignMatch = line.match(/^(?:local\s+|export\s+|readonly\s+)?([a-zA-Z_][a-zA-Z0-9_]*)=([\s\S]*)$/);
      if (assignMatch) {
        const vName = assignMatch[1];
        let rhs = assignMatch[2].trim();
        if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) {
          rhs = rhs.slice(1, -1);
        }
        vars[vName] = expandString(rhs);
        i++;
        continue;
      }

      // 7. Standalone arithmetic `(( i++ ))` or `(( a = a + b ))`
      const standaloneArith = line.match(/^\(\(\s*([\s\S]+?)\s*\)\)$/);
      if (standaloneArith) {
        const inner = standaloneArith[1];
        const pp = inner.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+\+|--)$/) || inner.match(/^(\+\+|--)([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (pp) {
          const vName = pp[1] === '++' || pp[1] === '--' ? pp[2] : pp[1];
          const op = pp[1] === '++' || pp[2] === '++' ? 1 : -1;
          vars[vName] = Number(vars[vName] || 0) + op;
        } else {
          const eq = inner.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
          if (eq) vars[eq[1]] = evalArith(eq[2]);
        }
        i++;
        continue;
      }

      // 8. `echo` command
      const echoMatch = line.match(/^echo(?:\s+(-[neE]+))?(?:\s+(.*))?$/);
      if (echoMatch) {
        const flags = echoMatch[1] || '';
        let arg = (echoMatch[2] || '').trim();
        if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
          arg = arg.slice(1, -1);
        }
        let expanded = expandString(arg);
        if (flags.includes('e')) {
          expanded = expanded.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        }
        if (flags.includes('n')) {
          currentLineBuf += expanded;
        } else {
          outLines.push(currentLineBuf + expanded);
          currentLineBuf = '';
        }
        i++;
        continue;
      }

      // 9. `printf` command
      const printfMatch = line.match(/^printf\s+(.+)$/);
      if (printfMatch) {
        const expanded = expandString(printfMatch[1].replace(/^["']|["']$/g, '')).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        if (expanded.endsWith('\n')) {
          outLines.push(currentLineBuf + expanded.slice(0, -1));
          currentLineBuf = '';
        } else {
          currentLineBuf += expanded;
        }
        i++;
        continue;
      }

      // Unknown command -> return null so Wandbox Linux container executes it
      return null;
    }
    return true;
  };

  const ok = execBlock(rawLines);
  if (!ok) return null;
  if (currentLineBuf) outLines.push(currentLineBuf);

  const durationMs = Math.max(1, Math.round(performance.now() - start));
  return {
    stdout: outLines.join('\n') || '(Script Bash eseguito con successo senza output)',
    stderr: '',
    durationMs,
    engineLabel: 'Bash Shell Engine (Locale • Zero Key)'
  };
}

/**
 * Executes Python, C/C++, Java, PHP, or Bash via the free keyless Wandbox public compiler API.
 */
async function runWithWandbox(rawCode: string, lang: string): Promise<CodeExecutionResult | null> {
  const compiler = WANDBOX_COMPILERS[lang];
  if (!compiler) return null;

  let codeToCompile = rawCode;

  // Wrap partial C++ or Java snippets if they lack main(), and run Bash inside Linux /bin/bash
  if (lang === 'bash') {
    codeToCompile = [
      'import subprocess, sys',
      `script = ${JSON.stringify(rawCode)}`,
      'res = subprocess.run(["/bin/bash", "-c", script], capture_output=True, text=True)',
      'if res.stdout: sys.stdout.write(res.stdout)',
      'if res.stderr: sys.stderr.write(res.stderr)'
    ].join('\n');
  } else if (lang === 'cpp' && !/\bmain\s*\(/.test(rawCode)) {
    codeToCompile = `#include <iostream>\n#include <vector>\n#include <string>\n#include <cmath>\nusing namespace std;\nint main() {\n${rawCode}\nreturn 0;\n}`;
  } else if (lang === 'java' && !/\bclass\s+/.test(rawCode)) {
    codeToCompile = `import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n${rawCode}\n  }\n}`;
  } else if (lang === 'php' && !rawCode.includes('<?')) {
    codeToCompile = `<?php\n${rawCode}\n?>`;
  }

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const response = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler,
        code: codeToCompile,
        save: false
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) return null;
    const data = await response.json();
    const durationMs = Math.max(1, Math.round(performance.now() - start));

    const stdout = (data.program_output || data.program_message || '').trim();
    const stderr = (data.compiler_error || data.program_error || '').trim();

    return {
      stdout: stdout || (!stderr ? '(Esecuzione completata senza output)' : ''),
      stderr,
      durationMs,
      engineLabel: lang === 'bash' ? 'Linux GNU Bash Sandbox (Zero Key)' : `Cloud Sandbox (${compiler} • Zero Key)`
    };
  } catch {
    return null;
  }
}

/**
 * Executes or simulates SQL queries and partial code snippets using the user's configured Gemini key.
 */
async function runWithGeminiSimulator(
  rawCode: string,
  lang: string,
  apiKeys: string[],
  selectedModel: string
): Promise<CodeExecutionResult> {
  const start = performance.now();
  if (!apiKeys || apiKeys.length === 0) {
    return {
      stdout: '',
      stderr:
        lang === 'sql'
          ? 'Per simulare query SQL su tabelle di esempio, configura la tua chiave Gemini nel pulsante "🔑 Keys" in alto a destra.'
          : 'Impossibile contattare il compilatore remoto e nessuna chiave Gemini configurata per la simulazione.',
      durationMs: 1,
      engineLabel: 'Simulatore Offline'
    };
  }

  const prompt =
    lang === 'sql'
      ? `Agisci come un motore database SQL reale (PostgreSQL / MySQL). Esegui o simula la seguente query SQL generando una tabella ASCII pulita con dati realistici coerenti con i nomi delle tabelle/colonne, più il numero di righe restituite. NON aggiungere spiegazioni prolisse, mostra solo l'output del terminale SQL.\n\nQuery SQL:\n${rawCode}`
      : `Agisci come un interprete/compilatore ${lang.toUpperCase()} reale. Esegui il seguente codice (se mancano variabili di contesto come liste o input di esempio, inizializzale con valori sensati) e restituisci ESCLUSIVAMENTE l'output esatto che comparirebbe nel terminale (stdout/stderr), senza blocchi markdown \`\`\` e senza commenti discorsivi.\n\nCodice:\n${rawCode}`;

  try {
    const safeModel = normalizeGeminiModelName(selectedModel);
    const output = await callGeminiWithRotation(
      apiKeys,
      safeModel,
      [{ role: 'user', parts: [{ text: prompt }] }],
      'Restituisci solo l output puro da terminale, senza markdown ``` e senza introduzioni.'
    );
    const cleaned = output.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const durationMs = Math.max(1, Math.round(performance.now() - start));
    return {
      stdout: cleaned || '(Nessun output)',
      stderr: '',
      durationMs,
      engineLabel: lang === 'sql' ? 'Motore SQL Simulato (Gemini Key)' : `Interprete AI (${lang.toUpperCase()})`
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      stdout: '',
      stderr: `Errore durante l'esecuzione: ${msg}`,
      durationMs: Math.max(1, Math.round(performance.now() - start)),
      engineLabel: 'Errore Esecuzione'
    };
  }
}

/**
 * Main entry point to execute any `.note-code-block` inside notes.
 */
export async function executeCodeBlock(
  rawCode: string,
  language: string,
  apiKeys: string[],
  selectedModel: string
): Promise<CodeExecutionResult> {
  const code = (rawCode || '').trim();
  const lang = (language || 'javascript').toLowerCase();

  if (!code) {
    return {
      stdout: '',
      stderr: 'Il blocco di codice è vuoto. Scrivi del codice prima di premere ▶ Esegui.',
      durationMs: 0,
      engineLabel: 'Vuoto'
    };
  }

  const looksLikeSql =
    /^\s*(?:CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TABLE|DROP\s+TABLE|ALTER\s+TABLE|TRUNCATE\s+TABLE|INSERT\s+INTO|UPDATE\s+[a-zA-Z0-9_`"]+\s+SET|DELETE\s+FROM|SELECT\s+[\s\S]+?\s+FROM|SHOW\s+TABLES|DESCRIBE\s+|DESC\s+)/im.test(
      code
    );
  const effectiveLang = looksLikeSql ? 'sql' : lang;

  if (effectiveLang === 'javascript') {
    const jsRes = runJavaScriptInBrowser(code);
    // If JS threw a ReferenceError because it's a partial snippet using undeclared variables (e.g. `lista`), and Gemini key is available, offer fallback
    if (jsRes.stderr.includes('ReferenceError') && apiKeys.length > 0) {
      const aiRes = await runWithGeminiSimulator(code, 'javascript', apiKeys, selectedModel);
      if (aiRes.stdout && !aiRes.stderr) {
        return {
          ...aiRes,
          engineLabel: 'JS Snippet Auto-Context (Gemini)'
        };
      }
    }
    return jsRes;
  }

  if (effectiveLang === 'bash') {
    const localBash = runBashLocally(code);
    if (localBash) {
      return localBash;
    }
  }

  if (lang === 'html') {
    return {
      stdout: 'Anteprima HTML/CSS renderizzata sotto:',
      stderr: '',
      durationMs: 2,
      engineLabel: 'HTML/CSS Live Preview (Locale)',
      isHtmlPreview: true,
      htmlContent: code
    };
  }

  if (lang === 'json') {
    const start = performance.now();
    try {
      const parsed = JSON.parse(code);
      const keysCount = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0;
      return {
        stdout: `✅ JSON Valido (${keysCount} chiavi radice)\n` + JSON.stringify(parsed, null, 2),
        stderr: '',
        durationMs: Math.max(1, Math.round(performance.now() - start)),
        engineLabel: 'Validatore JSON (Locale)'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        stdout: '',
        stderr: `❌ JSON Non Valido: ${msg}`,
        durationMs: 1,
        engineLabel: 'Validatore JSON (Locale)'
      };
    }
  }

  if (effectiveLang === 'sql') {
    const start = performance.now();
    const localSql = executeSqlLocally(code);
    if (localSql.handled) {
      return {
        stdout: localSql.stdout || (!localSql.stderr ? '✓ Query SQL eseguita con successo.' : ''),
        stderr: localSql.stderr,
        durationMs: Math.max(1, Math.round(performance.now() - start)),
        engineLabel: 'Motore SQL Relazionale (Locale • Zero Key)'
      };
    }

    // If user ran SELECT on a table they haven't created yet:
    if (apiKeys && apiKeys.length > 0) {
      const simRes = await runWithGeminiSimulator(code, 'sql', apiKeys, selectedModel);
      if (simRes.stdout && !simRes.stderr) {
        return {
          ...simRes,
          stdout: localSql.stdout ? `${localSql.stdout}\n\n${simRes.stdout}` : simRes.stdout
        };
      }
    }

    // Zero-key local fallback when querying an uncreated table: show helpful demo result + hint
    const tblMatch = code.match(/FROM\s+[`"']?([a-zA-Z0-9_]+)[`"']?/i);
    const tblName = tblMatch ? tblMatch[1] : 'esempio';
    const demoTable = formatAsciiTable(
      ['id', 'nome', 'valore', 'stato'],
      [
        { id: 1, nome: `${tblName}_item_1`, valore: 100, stato: 'ATTIVO' },
        { id: 2, nome: `${tblName}_item_2`, valore: 250, stato: 'ATTIVO' },
        { id: 3, nome: `${tblName}_item_3`, valore: 80, stato: 'COMPLETATO' }
      ]
    );
    return {
      stdout:
        (localSql.stdout ? `${localSql.stdout}\n\n` : '') +
        `ℹ️ Nota: la tabella '${tblName}' non era ancora stata creata con CREATE TABLE, ecco un'anteprima simulata:\n` +
        demoTable,
      stderr: '',
      durationMs: Math.max(1, Math.round(performance.now() - start)),
      engineLabel: 'Motore SQL Relazionale (Locale • Zero Key)'
    };
  }

  // Python, C/C++, Java, PHP, Bash -> try free keyless Wandbox first
  const wandboxResult = await runWithWandbox(code, lang);
  if (wandboxResult) {
    // If it failed due to undefined variable in a partial note snippet (like `NameError` in Python) and user has Gemini key, auto-simulate
    if (
      wandboxResult.stderr &&
      /(NameError|undeclared|cannot find symbol)/i.test(wandboxResult.stderr) &&
      apiKeys.length > 0
    ) {
      const simulated = await runWithGeminiSimulator(code, lang, apiKeys, selectedModel);
      if (simulated.stdout && !simulated.stderr) {
        return simulated;
      }
    }
    return wandboxResult;
  }

  // Fallback to Gemini simulator if offline or Wandbox unreachable
  return runWithGeminiSimulator(code, lang, apiKeys, selectedModel);
}
