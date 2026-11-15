export interface SqlColumnDef {
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
}

export interface SqlTable {
  name: string;
  columns: SqlColumnDef[];
  rows: Record<string, any>[];
}

export interface SqlDatabaseState {
  tables: Record<string, SqlTable>;
}

const SQL_STORAGE_KEY = 'ws_its_sql_db_v1';

let memoryDb: SqlDatabaseState = { tables: {} };

function loadDb(): SqlDatabaseState {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(SQL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.tables === 'object') {
          memoryDb = parsed;
          return memoryDb;
        }
      }
    }
  } catch {
    // fallback to memoryDb
  }
  return memoryDb;
}

function saveDb(db: SqlDatabaseState): void {
  memoryDb = db;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SQL_STORAGE_KEY, JSON.stringify(db));
    }
  } catch {
    // ignore storage quota errors
  }
}

export function resetSqlDatabase(): void {
  saveDb({ tables: {} });
}

/**
 * Splits a multi-statement SQL script by semicolons outside single/double quotes and comments.
 */
export function splitSqlStatements(sqlScript: string): string[] {
  const cleaned = sqlScript
    .replace(/--[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "'" && !inDouble) {
      if (inSingle && cleaned[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
    } else if (ch === ';' && !inSingle && !inDouble) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    statements.push(current.trim());
  }
  return statements;
}

/**
 * Formats an array of row objects as a clean Unicode/ASCII box table.
 */
export function formatAsciiTable(columns: string[], rows: Record<string, any>[]): string {
  if (columns.length === 0) return '(0 colonne)';
  const strRows = rows.map(r =>
    columns.map(c => {
      const val = r[c];
      if (val === null || val === undefined) return 'NULL';
      return String(val);
    })
  );

  const widths = columns.map((col, idx) => {
    const maxCell = strRows.reduce((max, row) => Math.max(max, (row[idx] || '').length), 0);
    return Math.max(col.length, maxCell, 3);
  });

  const buildBorder = (left: string, mid: string, right: string) =>
    left + widths.map(w => '─'.repeat(w + 2)).join(mid) + right;

  const headerLine =
    '│ ' + columns.map((col, idx) => col.padEnd(widths[idx], ' ')).join(' │ ') + ' │';

  const bodyLines = strRows.map(
    row => '│ ' + row.map((cell, idx) => cell.padEnd(widths[idx], ' ')).join(' │ ') + ' │'
  );

  return [
    buildBorder('┌', '┬', '┐'),
    headerLine,
    buildBorder('├', '┼', '┤'),
    ...(bodyLines.length > 0 ? bodyLines : ['│ ' + widths.map(w => ' '.repeat(w)).join(' │ ') + ' │']),
    buildBorder('└', '┴', '┘'),
    `(${rows.length} ${rows.length === 1 ? 'riga' : 'righe'})`
  ].join('\n');
}

function parseSqlLiteral(raw: string): any {
  const s = raw.trim();
  if (/^null$/i.test(s)) return null;
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return Number(s);
  }
  return s;
}

function splitTopLevelCommaList(input: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      if (inSingle && input[i + 1] === "'") {
        cur += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
      cur += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += ch;
    } else if (!inSingle && !inDouble) {
      if (ch === '(') {
        depth++;
        cur += ch;
      } else if (ch === ')') {
        depth = Math.max(0, depth - 1);
        cur += ch;
      } else if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function resolveField(row: Record<string, any>, colExpr: string): any {
  const clean = colExpr.trim().replace(/^[`"\[]|[`"\]]$/g, '');
  if (clean in row) return row[clean];
  const lower = clean.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
    const shortKey = k.includes('.') ? k.split('.').pop()!.toLowerCase() : k.toLowerCase();
    const shortClean = lower.includes('.') ? lower.split('.').pop()! : lower;
    if (shortKey === shortClean) return row[k];
  }
  return undefined;
}

function evaluateWhereClause(row: Record<string, any>, whereClause: string): boolean {
  if (!whereClause || !whereClause.trim()) return true;
  const trimmed = whereClause.trim();

  // Split by OR at top level
  const orParts = trimmed.split(/\s+OR\s+/i);
  if (orParts.length > 1) {
    return orParts.some(p => evaluateWhereClause(row, p));
  }

  // Split by AND at top level
  const andParts = trimmed.split(/\s+AND\s+/i);
  if (andParts.length > 1) {
    return andParts.every(p => evaluateWhereClause(row, p));
  }

  // IS NULL / IS NOT NULL
  const isNotNullMatch = trimmed.match(/^([a-zA-Z0-9_.$]+)\s+IS\s+NOT\s+NULL$/i);
  if (isNotNullMatch) {
    const val = resolveField(row, isNotNullMatch[1]);
    return val !== null && val !== undefined;
  }
  const isNullMatch = trimmed.match(/^([a-zA-Z0-9_.$]+)\s+IS\s+NULL$/i);
  if (isNullMatch) {
    const val = resolveField(row, isNullMatch[1]);
    return val === null || val === undefined;
  }

  // IN (...)
  const inMatch = trimmed.match(/^([a-zA-Z0-9_.$]+)\s+IN\s*\((.+)\)$/i);
  if (inMatch) {
    const val = resolveField(row, inMatch[1]);
    const list = splitTopLevelCommaList(inMatch[2]).map(parseSqlLiteral);
    return list.some(item => String(item).toLowerCase() === String(val).toLowerCase());
  }

  // BETWEEN a AND b
  const likeMatch = trimmed.match(/^([a-zA-Z0-9_.$]+)\s+LIKE\s+(.+)$/i);
  if (likeMatch) {
    const val = String(resolveField(row, likeMatch[1]) ?? '');
    const pattern = String(parseSqlLiteral(likeMatch[2]));
    const regexStr = '^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$';
    return new RegExp(regexStr, 'i').test(val);
  }

  // Comparison operators: >=, <=, !=, <>, =, >, <
  const cmpMatch = trimmed.match(/^([a-zA-Z0-9_.$]+)\s*(>=|<=|!=|<>|=|>|<)\s*(.+)$/);
  if (cmpMatch) {
    const leftVal = resolveField(row, cmpMatch[1]);
    const op = cmpMatch[2];
    const rightRaw = cmpMatch[3].trim();
    const rightFieldVal = resolveField(row, rightRaw);
    const rightVal =
      rightFieldVal !== undefined && !/^['"\d-]/.test(rightRaw)
        ? rightFieldVal
        : parseSqlLiteral(rightRaw);

    const numLeft = typeof leftVal === 'number' ? leftVal : Number(leftVal);
    const numRight = typeof rightVal === 'number' ? rightVal : Number(rightVal);
    const bothNumeric =
      leftVal !== null &&
      rightVal !== null &&
      leftVal !== '' &&
      rightVal !== '' &&
      !Number.isNaN(numLeft) &&
      !Number.isNaN(numRight);

    switch (op) {
      case '=':
        return bothNumeric
          ? numLeft === numRight
          : String(leftVal ?? '').toLowerCase() === String(rightVal ?? '').toLowerCase();
      case '!=':
      case '<>':
        return bothNumeric
          ? numLeft !== numRight
          : String(leftVal ?? '').toLowerCase() !== String(rightVal ?? '').toLowerCase();
      case '>':
        return bothNumeric ? numLeft > numRight : String(leftVal ?? '') > String(rightVal ?? '');
      case '<':
        return bothNumeric ? numLeft < numRight : String(leftVal ?? '') < String(rightVal ?? '');
      case '>=':
        return bothNumeric ? numLeft >= numRight : String(leftVal ?? '') >= String(rightVal ?? '');
      case '<=':
        return bothNumeric ? numLeft <= numRight : String(leftVal ?? '') <= String(rightVal ?? '');
    }
  }

  return true;
}

/**
 * Executes a SQL script (single or multiple statements) against the persistent in-browser SQL database.
 */
export function executeSqlLocally(sqlScript: string): {
  stdout: string;
  stderr: string;
  handled: boolean;
} {
  const statements = splitSqlStatements(sqlScript);
  if (statements.length === 0) {
    return { stdout: '', stderr: 'Nessuna istruzione SQL valida trovata.', handled: true };
  }

  const db = loadDb();
  const outputs: string[] = [];
  const errors: string[] = [];

  for (const rawStmt of statements) {
    const stmt = rawStmt.trim();
    if (!stmt) continue;

    try {
      // 1. SHOW TABLES / .tables
      if (/^(SHOW\s+TABLES|\.tables)$/i.test(stmt)) {
        const tableNames = Object.keys(db.tables);
        const rows = tableNames.map(t => ({
          tabella: db.tables[t].name,
          colonne: db.tables[t].columns.length,
          righe: db.tables[t].rows.length
        }));
        outputs.push(
          rows.length > 0
            ? formatAsciiTable(['tabella', 'colonne', 'righe'], rows)
            : '(Nessuna tabella presente nel database)'
        );
        continue;
      }

      // 2. DESCRIBE / DESC / PRAGMA table_info
      const descMatch =
        stmt.match(/^(?:DESCRIBE|DESC)\s+([a-zA-Z0-9_]+)$/i) ||
        stmt.match(/^PRAGMA\s+table_info\s*\(\s*['"]?([a-zA-Z0-9_]+)['"]?\s*\)$/i);
      if (descMatch) {
        const tKey = descMatch[1].toLowerCase();
        const tbl = db.tables[tKey];
        if (!tbl) {
          errors.push(`Errore SQL: La tabella '${descMatch[1]}' non esiste.`);
          continue;
        }
        const descRows = tbl.columns.map(c => ({
          colonna: c.name,
          tipo: c.type,
          chiave: c.primaryKey ? 'PRI' : '',
          nullo: c.notNull || c.primaryKey ? 'NO' : 'YES'
        }));
        outputs.push(
          `Struttura tabella '${tbl.name}':\n` +
            formatAsciiTable(['colonna', 'tipo', 'chiave', 'nullo'], descRows)
        );
        continue;
      }

      // 3. CREATE TABLE
      const createMatch = stmt.match(
        /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(([\s\S]+)\)$/i
      );
      if (createMatch) {
        const rawTableName = createMatch[1];
        const tableKey = rawTableName.toLowerCase();
        const body = createMatch[2].trim();
        const defParts = splitTopLevelCommaList(body);

        const cols: SqlColumnDef[] = [];
        const tableLevelPKs = new Set<string>();

        for (const part of defParts) {
          const pTrim = part.trim();
          const pkConstraint = pTrim.match(/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
          if (pkConstraint) {
            pkConstraint[1]
              .split(',')
              .map(s => s.trim().replace(/[`"']/g, '').toLowerCase())
              .forEach(k => tableLevelPKs.add(k));
            continue;
          }
          if (/^(?:FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|INDEX|KEY)\b/i.test(pTrim)) {
            continue;
          }
          const tokens = pTrim.split(/\s+/);
          if (tokens.length >= 1) {
            const colName = tokens[0].replace(/[`"']/g, '');
            const colType = (tokens[1] || 'TEXT').toUpperCase();
            const isPk = /PRIMARY\s+KEY/i.test(pTrim);
            const isNotNull = /NOT\s+NULL/i.test(pTrim) || isPk;
            cols.push({
              name: colName,
              type: colType,
              primaryKey: isPk,
              notNull: isNotNull
            });
          }
        }

        cols.forEach(c => {
          if (tableLevelPKs.has(c.name.toLowerCase())) {
            c.primaryKey = true;
            c.notNull = true;
          }
        });

        db.tables[tableKey] = {
          name: rawTableName,
          columns: cols,
          rows: []
        };
        saveDb(db);

        const schemaPreview = cols.map(c => ({
          colonna: c.name,
          tipo: c.type,
          vincoli: [c.primaryKey ? 'PRIMARY KEY' : '', c.notNull && !c.primaryKey ? 'NOT NULL' : '']
            .filter(Boolean)
            .join(' ') || '-'
        }));
        outputs.push(
          `✓ Tabella '${rawTableName}' creata con successo (${cols.length} colonne):\n` +
            formatAsciiTable(['colonna', 'tipo', 'vincoli'], schemaPreview)
        );
        continue;
      }

      // 4. DROP TABLE
      const dropMatch = stmt.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"']?([a-zA-Z0-9_]+)[`"']?$/i);
      if (dropMatch) {
        const tName = dropMatch[1];
        const tKey = tName.toLowerCase();
        delete db.tables[tKey];
        saveDb(db);
        outputs.push(`✓ Tabella '${tName}' eliminata.`);
        continue;
      }

      // 5. TRUNCATE TABLE
      const truncMatch = stmt.match(/^TRUNCATE\s+(?:TABLE\s+)?[`"']?([a-zA-Z0-9_]+)[`"']?$/i);
      if (truncMatch) {
        const tKey = truncMatch[1].toLowerCase();
        if (!db.tables[tKey]) {
          errors.push(`Errore SQL: La tabella '${truncMatch[1]}' non esiste.`);
          continue;
        }
        db.tables[tKey].rows = [];
        saveDb(db);
        outputs.push(`✓ Tabella '${db.tables[tKey].name}' svuotata (0 righe).`);
        continue;
      }

      // 6. ALTER TABLE ... ADD COLUMN
      const alterAddMatch = stmt.match(
        /^ALTER\s+TABLE\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s+ADD\s+(?:COLUMN\s+)?[`"']?([a-zA-Z0-9_]+)[`"']?\s+([a-zA-Z0-9_()]+)/i
      );
      if (alterAddMatch) {
        const tKey = alterAddMatch[1].toLowerCase();
        const colName = alterAddMatch[2];
        const colType = alterAddMatch[3].toUpperCase();
        const tbl = db.tables[tKey];
        if (!tbl) {
          errors.push(`Errore SQL: La tabella '${alterAddMatch[1]}' non esiste.`);
          continue;
        }
        tbl.columns.push({ name: colName, type: colType });
        tbl.rows.forEach(r => {
          r[colName] = null;
        });
        saveDb(db);
        outputs.push(`✓ Colonna '${colName}' (${colType}) aggiunta alla tabella '${tbl.name}'.`);
        continue;
      }

      // 7. INSERT INTO
      const insertMatch = stmt.match(
        /^INSERT\s+INTO\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+)$/i
      );
      if (insertMatch) {
        const rawTableName = insertMatch[1];
        const tKey = rawTableName.toLowerCase();
        const explicitColsRaw = insertMatch[2];
        const valuesBody = insertMatch[3].trim();

        let tbl = db.tables[tKey];
        // Auto-create table if user runs INSERT INTO without prior CREATE TABLE
        if (!tbl) {
          const inferredCols: SqlColumnDef[] = explicitColsRaw
            ? explicitColsRaw.split(',').map(c => ({
                name: c.trim().replace(/[`"']/g, ''),
                type: 'TEXT'
              }))
            : [];
          tbl = {
            name: rawTableName,
            columns: inferredCols,
            rows: []
          };
          db.tables[tKey] = tbl;
        }

        // Extract value tuples: (v1, v2, ...), (v3, v4, ...)
        const tupleStrings: string[] = [];
        let curTuple = '';
        let depth = 0;
        let inSingle = false;
        let inDouble = false;

        for (let i = 0; i < valuesBody.length; i++) {
          const ch = valuesBody[i];
          if (ch === "'" && !inDouble) {
            if (inSingle && valuesBody[i + 1] === "'") {
              curTuple += "''";
              i++;
              continue;
            }
            inSingle = !inSingle;
            curTuple += ch;
          } else if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            curTuple += ch;
          } else if (!inSingle && !inDouble) {
            if (ch === '(') {
              if (depth > 0) curTuple += ch;
              depth++;
            } else if (ch === ')') {
              depth--;
              if (depth === 0) {
                tupleStrings.push(curTuple.trim());
                curTuple = '';
              } else {
                curTuple += ch;
              }
            } else if (depth > 0) {
              curTuple += ch;
            }
          } else if (depth > 0) {
            curTuple += ch;
          }
        }

        let insertedCount = 0;
        for (const tupleStr of tupleStrings) {
          const rawVals = splitTopLevelCommaList(tupleStr).map(parseSqlLiteral);
          if (tbl.columns.length === 0) {
            tbl.columns = rawVals.map((_, idx) => ({
              name: `col_${idx + 1}`,
              type: typeof rawVals[idx] === 'number' ? 'INT' : 'VARCHAR'
            }));
          }

          const targetColNames = explicitColsRaw
            ? explicitColsRaw.split(',').map(c => c.trim().replace(/[`"']/g, ''))
            : tbl.columns.map(c => c.name);

          const newRow: Record<string, any> = {};
          tbl.columns.forEach(c => {
            newRow[c.name] = null;
          });

          targetColNames.forEach((cName, idx) => {
            const matchedCol =
              tbl!.columns.find(c => c.name.toLowerCase() === cName.toLowerCase())?.name || cName;
            newRow[matchedCol] = idx < rawVals.length ? rawVals[idx] : null;
          });

          tbl.rows.push(newRow);
          insertedCount++;
        }

        saveDb(db);
        outputs.push(
          `✓ ${insertedCount} ${insertedCount === 1 ? 'riga inserita' : 'righe inserite'} in '${tbl.name}' (Totale righe: ${tbl.rows.length}).`
        );
        continue;
      }

      // 8. UPDATE table SET ... [WHERE ...]
      const updateMatch = stmt.match(
        /^UPDATE\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i
      );
      if (updateMatch) {
        const tKey = updateMatch[1].toLowerCase();
        const setPart = updateMatch[2].trim();
        const wherePart = updateMatch[3] || '';
        const tbl = db.tables[tKey];
        if (!tbl) {
          errors.push(`Errore SQL: La tabella '${updateMatch[1]}' non esiste.`);
          continue;
        }

        const assignments = splitTopLevelCommaList(setPart).map(pair => {
          const eqIdx = pair.indexOf('=');
          const col = pair.slice(0, eqIdx).trim().replace(/[`"']/g, '');
          const valExpr = pair.slice(eqIdx + 1).trim();
          return { col, valExpr };
        });

        let updatedCount = 0;
        tbl.rows.forEach(row => {
          if (evaluateWhereClause(row, wherePart)) {
            assignments.forEach(({ col, valExpr }) => {
              const targetKey =
                tbl.columns.find(c => c.name.toLowerCase() === col.toLowerCase())?.name || col;
              // Check simple arithmetic like voto = voto + 1
              const mathMatch = valExpr.match(/^([a-zA-Z0-9_]+)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
              if (mathMatch) {
                const baseVal = Number(resolveField(row, mathMatch[1]) ?? 0);
                const rhs = Number(mathMatch[3]);
                if (mathMatch[2] === '+') row[targetKey] = baseVal + rhs;
                else if (mathMatch[2] === '-') row[targetKey] = baseVal - rhs;
                else if (mathMatch[2] === '*') row[targetKey] = baseVal * rhs;
                else if (mathMatch[2] === '/') row[targetKey] = rhs !== 0 ? baseVal / rhs : null;
              } else {
                row[targetKey] = parseSqlLiteral(valExpr);
              }
            });
            updatedCount++;
          }
        });

        saveDb(db);
        outputs.push(
          `✓ ${updatedCount} ${updatedCount === 1 ? 'riga aggiornata' : 'righe aggiornate'} in '${tbl.name}'.`
        );
        continue;
      }

      // 9. DELETE FROM table [WHERE ...]
      const deleteMatch = stmt.match(
        /^DELETE\s+FROM\s+[`"']?([a-zA-Z0-9_]+)[`"']?(?:\s+WHERE\s+([\s\S]+))?$/i
      );
      if (deleteMatch) {
        const tKey = deleteMatch[1].toLowerCase();
        const wherePart = deleteMatch[2] || '';
        const tbl = db.tables[tKey];
        if (!tbl) {
          errors.push(`Errore SQL: La tabella '${deleteMatch[1]}' non esiste.`);
          continue;
        }
        const before = tbl.rows.length;
        tbl.rows = tbl.rows.filter(r => !evaluateWhereClause(r, wherePart));
        const deleted = before - tbl.rows.length;
        saveDb(db);
        outputs.push(
          `✓ ${deleted} ${deleted === 1 ? 'riga eliminata' : 'righe eliminate'} da '${tbl.name}'.`
        );
        continue;
      }

      // 10. SELECT query
      const selectMatch = stmt.match(
        /^SELECT\s+(DISTINCT\s+)?([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_`"'.,\s]+?)(?:\s+((?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+|CROSS\s+)?JOIN\s+[\s\S]+?))?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+GROUP\s+BY\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?$/i
      );
      if (selectMatch) {
        const isDistinct = Boolean(selectMatch[1]);
        const selectListRaw = selectMatch[2].trim();
        const fromPart = selectMatch[3].trim();
        const joinPart = selectMatch[4]?.trim() || '';
        const wherePart = selectMatch[5]?.trim() || '';
        const groupByPart = selectMatch[6]?.trim() || '';
        const orderByPart = selectMatch[7]?.trim() || '';
        const limitNum = selectMatch[8] ? parseInt(selectMatch[8], 10) : null;

        const fromTokens = fromPart.replace(/[`"']/g, '').trim().split(/\s+/);
        const baseTableName = fromTokens[0];
        const baseAlias = fromTokens[1] && !/^AS$/i.test(fromTokens[1]) ? fromTokens[1] : fromTokens[2] || baseTableName;
        const baseTable = db.tables[baseTableName.toLowerCase()];

        if (!baseTable) {
          // If the table doesn't exist in our local DB, return handled: false so Gemini or auto-seed can handle it
          return {
            stdout: outputs.join('\n\n'),
            stderr: `La tabella '${baseTableName}' non è ancora stata creata. Esegui prima CREATE TABLE ${baseTableName} (...) oppure INSERT INTO ${baseTableName} ...`,
            handled: false
          };
        }

        // Build working dataset with both bare column names and alias.col names
        let workingRows: Record<string, any>[] = baseTable.rows.map(r => {
          const copy: Record<string, any> = { ...r };
          Object.keys(r).forEach(k => {
            copy[`${baseTableName}.${k}`] = r[k];
            copy[`${baseAlias}.${k}`] = r[k];
          });
          return copy;
        });

        // Optional JOIN processing
        if (joinPart) {
          const joinRegex =
            /(?:(INNER|LEFT(?:\s+OUTER)?)\s+)?JOIN\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\s+ON\s+([^\s]+)\s*=\s*([^\s]+)/gi;
          let jMatch: RegExpExecArray | null;
          while ((jMatch = joinRegex.exec(joinPart)) !== null) {
            const joinType = (jMatch[1] || 'INNER').toUpperCase();
            const joinTableName = jMatch[2];
            const joinAlias = jMatch[3] || joinTableName;
            const leftOn = jMatch[4];
            const rightOn = jMatch[5];

            const joinTbl = db.tables[joinTableName.toLowerCase()];
            if (!joinTbl) {
              errors.push(`Errore SQL: La tabella in JOIN '${joinTableName}' non esiste.`);
              break;
            }

            const nextRows: Record<string, any>[] = [];
            for (const leftRow of workingRows) {
              let matchedAny = false;
              for (const rightRow of joinTbl.rows) {
                const combined: Record<string, any> = { ...leftRow };
                Object.keys(rightRow).forEach(k => {
                  if (!(k in combined)) combined[k] = rightRow[k];
                  combined[`${joinTableName}.${k}`] = rightRow[k];
                  combined[`${joinAlias}.${k}`] = rightRow[k];
                });

                const v1 = resolveField(combined, leftOn);
                const v2 = resolveField(combined, rightOn);
                if (v1 !== undefined && v2 !== undefined && String(v1) === String(v2)) {
                  matchedAny = true;
                  nextRows.push(combined);
                }
              }
              if (!matchedAny && joinType.startsWith('LEFT')) {
                const combined: Record<string, any> = { ...leftRow };
                joinTbl.columns.forEach(c => {
                  if (!(c.name in combined)) combined[c.name] = null;
                  combined[`${joinTableName}.${c.name}`] = null;
                  combined[`${joinAlias}.${c.name}`] = null;
                });
                nextRows.push(combined);
              }
            }
            workingRows = nextRows;
          }
        }

        // WHERE filter
        if (wherePart) {
          workingRows = workingRows.filter(r => evaluateWhereClause(r, wherePart));
        }

        const selectItems = splitTopLevelCommaList(selectListRaw);
        const hasAggregates = selectItems.some(item => /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(item));

        let resultColumns: string[] = [];
        let resultRows: Record<string, any>[] = [];

        if (groupByPart || hasAggregates) {
          const groupCols = groupByPart
            ? splitTopLevelCommaList(groupByPart).map(c => c.trim())
            : [];

          const groups = new Map<string, Record<string, any>[]>();
          if (groupCols.length === 0) {
            groups.set('__all__', workingRows);
          } else {
            for (const r of workingRows) {
              const key = groupCols.map(gc => String(resolveField(r, gc) ?? 'NULL')).join('||');
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(r);
            }
          }

          groups.forEach(gRows => {
            const outRow: Record<string, any> = {};
            selectItems.forEach(item => {
              const aliasMatch = item.match(/^([\s\S]+?)\s+AS\s+[`"']?([a-zA-Z0-9_]+)[`"']?$/i);
              const expr = (aliasMatch ? aliasMatch[1] : item).trim();
              const label = (aliasMatch ? aliasMatch[2] : expr).trim();
              if (!resultColumns.includes(label)) resultColumns.push(label);

              const aggMatch = expr.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*([^)]+)\s*\)$/i);
              if (aggMatch) {
                const fn = aggMatch[1].toUpperCase();
                const colArg = aggMatch[2].trim();
                if (fn === 'COUNT') {
                  outRow[label] =
                    colArg === '*'
                      ? gRows.length
                      : gRows.filter(r => resolveField(r, colArg) !== null && resolveField(r, colArg) !== undefined)
                          .length;
                } else {
                  const nums = gRows
                    .map(r => Number(resolveField(r, colArg)))
                    .filter(n => !Number.isNaN(n));
                  if (fn === 'SUM') outRow[label] = nums.reduce((a, b) => a + b, 0);
                  else if (fn === 'AVG')
                    outRow[label] = nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : null;
                  else if (fn === 'MIN') outRow[label] = nums.length ? Math.min(...nums) : null;
                  else if (fn === 'MAX') outRow[label] = nums.length ? Math.max(...nums) : null;
                }
              } else {
                outRow[label] = gRows[0] ? resolveField(gRows[0], expr) : null;
              }
            });
            resultRows.push(outRow);
          });
        } else {
          // Non-aggregate projection
          if (selectItems.length === 1 && selectItems[0] === '*') {
            resultColumns = baseTable.columns.map(c => c.name);
            workingRows.forEach(r => {
              Object.keys(r).forEach(k => {
                if (!k.includes('.') && !resultColumns.includes(k)) {
                  resultColumns.push(k);
                }
              });
            });
            resultRows = workingRows.map(r => {
              const projected: Record<string, any> = {};
              resultColumns.forEach(c => {
                projected[c] = r[c];
              });
              return projected;
            });
          } else {
            resultRows = workingRows.map(r => {
              const projected: Record<string, any> = {};
              selectItems.forEach(item => {
                const aliasMatch = item.match(/^([\s\S]+?)\s+AS\s+[`"']?([a-zA-Z0-9_]+)[`"']?$/i);
                const expr = (aliasMatch ? aliasMatch[1] : item).trim();
                const label = (
                  aliasMatch ? aliasMatch[2] : expr.includes('.') ? expr.split('.').pop()! : expr
                ).trim();
                if (!resultColumns.includes(label)) resultColumns.push(label);
                projected[label] = resolveField(r, expr);
              });
              return projected;
            });
          }
        }

        // DISTINCT
        if (isDistinct) {
          const seen = new Set<string>();
          resultRows = resultRows.filter(r => {
            const sig = JSON.stringify(resultColumns.map(c => r[c]));
            if (seen.has(sig)) return false;
            seen.add(sig);
            return true;
          });
        }

        // ORDER BY
        if (orderByPart) {
          const orderSpecs = splitTopLevelCommaList(orderByPart).map(o => {
            const parts = o.trim().split(/\s+/);
            return {
              col: parts[0],
              desc: /^DESC$/i.test(parts[1] || '')
            };
          });
          resultRows.sort((a, b) => {
            for (const spec of orderSpecs) {
              const va = resolveField(a, spec.col);
              const vb = resolveField(b, spec.col);
              if (va === vb) continue;
              const na = Number(va);
              const nb = Number(vb);
              const cmp =
                !Number.isNaN(na) && !Number.isNaN(nb)
                  ? na - nb
                  : String(va ?? '').localeCompare(String(vb ?? ''));
              return spec.desc ? -cmp : cmp;
            }
            return 0;
          });
        }

        // LIMIT
        if (limitNum !== null && !Number.isNaN(limitNum)) {
          resultRows = resultRows.slice(0, limitNum);
        }

        outputs.push(formatAsciiTable(resultColumns, resultRows));
        continue;
      }

      // Unknown or complex SQL dialect statement -> let fallback handle if needed
      return {
        stdout: outputs.join('\n\n'),
        stderr: '',
        handled: false
      };
    } catch (err: any) {
      errors.push(`Errore SQL in "${stmt.slice(0, 40)}...": ${err?.message || String(err)}`);
    }
  }

  return {
    stdout: outputs.join('\n\n'),
    stderr: errors.join('\n'),
    handled: true
  };
}
