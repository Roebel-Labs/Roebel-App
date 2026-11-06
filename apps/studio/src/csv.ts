/** Parses pasted spreadsheet text or a CSV file. Auto-detects `,` / `;` / tab (German Excel uses `;`). */
export type ParsedCsv = {
  columns: string[];
  rows: Record<string, string>[];
  /** Rows that had non-empty values beyond the header width (those values are ignored). */
  overflowRows: number;
};

/** Decodes file bytes: UTF-8 when valid, else Windows-1252 (German Excel). */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Returns '' (never splits) when the header line has no separator, e.g. a single-column file. */
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
  if (counts[','] > 0) return ',';
  return '';
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
  const empty: ParsedCsv = { columns: [], rows: [], overflowRows: 0 };
  // Strip BOM and leading blank lines so delimiter detection sees the header.
  const clean = text.replace(/^\uFEFF/, '').replace(/^(?:[ \t]*\r?\n)+/, '');
  if (clean.trim() === '') return empty;
  const records = parseRecords(clean, detectDelimiter(clean)).filter((r) => r.some((c) => c.trim() !== ''));
  if (records.length === 0) return empty;
  const headers = uniqueHeaders(records[0]);
  const body = records.slice(1);
  // A trailing separator yields a nameless column: drop it when it holds no data, else name it.
  const keep: number[] = [];
  const columns: string[] = [];
  headers.forEach((h, i) => {
    // Check the RAW header: uniqueHeaders turns a second empty one into " 2".
    if ((records[0][i] ?? '').trim() === '') {
      if (!body.some((r) => (r[i] ?? '').trim() !== '')) return;
      let name = `Spalte ${i + 1}`;
      while (headers.includes(name) || columns.includes(name)) name = `${name}*`;
      keep.push(i);
      columns.push(name);
    } else {
      keep.push(i);
      columns.push(h);
    }
  });
  let overflowRows = 0;
  const rows = body.map((r) => {
    if (r.slice(headers.length).some((c) => c.trim() !== '')) overflowRows++;
    const values: Record<string, string> = {};
    columns.forEach((c, k) => {
      values[c] = r[keep[k]] ?? '';
    });
    return values;
  });
  return { columns, rows, overflowRows };
}
