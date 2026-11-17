import fs from 'fs';
import path from 'path';

const ledger = fs.readFileSync(path.resolve(__dirname, '../../../../docs/SOVEREIGNTY_LEDGER.md'), 'utf8');

const ROWS = ['Key custody', 'Key backup', 'Recovery', 'Gas', 'Bundler', 'RPC', 'App distribution', 'Database', 'Hosting'];

/** The cells of the first table after a heading line, one array per body row. */
function tableUnder(md: string, heading: string): string[][] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    if (line.trim().startsWith('|')) {
      inTable = true;
      rows.push(line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim()));
    } else if (inTable) break;
  }
  // header row and the separator row are not body rows
  return rows.slice(2);
}

describe('sovereignty ledger', () => {
  it.each(['Passkey', '12 Wörter', 'Google, Apple oder E-Mail'])('has all nine rows for %s, none empty', (p) => {
    const rows = tableUnder(ledger, `## ${p}`);
    expect(rows.map((r) => r[0])).toEqual(ROWS);
    for (const r of rows) {
      expect(r).toHaveLength(4);
      expect(r.slice(1).every((cell) => cell.length > 0)).toBe(true);
    }
  });

  it('names the three columns', () => {
    expect(ledger).toContain('| Row | Depends on | If that party disappears | If that party turns hostile |');
  });

  it('states what no party can do and what may be claimed in the app', () => {
    expect(ledger).toContain('## What no party can do');
    expect(ledger).toContain('## What we may say in the app');
  });
});
