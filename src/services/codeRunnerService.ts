import { callGeminiWithRotation } from './geminiService';
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
  bash: 'bash'
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
 * Executes Python, C/C++, Java, PHP, or Bash via the free keyless Wandbox public compiler API.
 */
async function runWithWandbox(rawCode: string, lang: string): Promise<CodeExecutionResult | null> {
  const compiler = WANDBOX_COMPILERS[lang];
  if (!compiler) return null;

  let codeToCompile = rawCode;

  // Wrap partial C++ or Java snippets if they lack main()
  if (lang === 'cpp' && !/\bmain\s*\(/.test(rawCode)) {
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
      engineLabel: `Cloud Sandbox (${compiler} • Zero Key)`
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
    const output = await callGeminiWithRotation(
      apiKeys,
      selectedModel || 'gemini-2.5-flash',
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
