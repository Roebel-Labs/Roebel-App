/** Parses pasted spreadsheet text or a CSV file. Auto-detects `,` / `;` / tab (German Excel uses `;`). */
export type ParsedCsv = { columns: string[]; rows: Record<string, string>[] };

function detectDelimiter(text: string): string {
  // Look only at the first record, ignoring quoted sections.
  let inQuotes = false;
  const counts: Record<string, number> = { '\t': 0, ';': 0, ',': 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  // Tab wins (Sheets paste), then semicolon (German Excel), then comma.
  if (counts['\t'] > 0) return '\t';
  if (counts[';'] > 0) return ';';
  return ',';
}

function parseRecords(text: string, delim: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  records.push(row);
  return records;
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  const used = new Set<string>();
  return raw.map((h) => {
    const base = h.trim();
    let n = seen.get(base) ?? 0;
    let name = base;
    do {
      n++;
      name = n === 1 ? base : `${base} ${n}`;
    } while (used.has(name));
    seen.set(base, n);
    used.add(name);
    return name;
  });
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '');
  if (clean.trim() === '') return { columns: [], rows: [] };
  const records = parseRecords(clean, detectDelimiter(clean)).filter((r) => r.some((c) => c.trim() !== ''));
  if (records.length === 0) return { columns: [], rows: [] };
  const columns = uniqueHeaders(records[0]);
  const rows = records.slice(1).map((r) => {
    const values: Record<string, string> = {};
    columns.forEach((c, i) => {
      values[c] = r[i] ?? '';
    });
    return values;
  });
  return { columns, rows };
}
