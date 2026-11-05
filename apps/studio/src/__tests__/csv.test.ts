import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csv';

describe('parseCsv', () => {
  it('parses German Excel semicolon exports', () => {
    const r = parseCsv('Gruppe;Verein\nSunshine Kids;TSV Röbel');
    expect(r.columns).toEqual(['Gruppe', 'Verein']);
    expect(r.rows).toEqual([{ Gruppe: 'Sunshine Kids', Verein: 'TSV Röbel' }]);
  });
  it('parses tab-separated paste from Google Sheets', () => {
    const r = parseCsv('Gruppe\tZeit\nA\t10:00\nB\t10:05\n');
    expect(r.columns).toEqual(['Gruppe', 'Zeit']);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1].Zeit).toBe('10:05');
  });
  it('keeps quoted separators, newlines and escaped quotes in one field', () => {
    const r = parseCsv('A,B\n"x, y","l1\nl2 ""q"""');
    expect(r.rows).toEqual([{ A: 'x, y', B: 'l1\nl2 "q"' }]);
    expect(parseCsv('"A, B",C').columns).toEqual(['A, B', 'C']);
  });
  it('strips BOM, trims headers, handles CRLF', () => {
    const r = parseCsv('﻿ Gruppe ;Verein\r\nA;B\r\n');
    expect(r.columns).toEqual(['Gruppe', 'Verein']);
    expect(r.rows).toEqual([{ Gruppe: 'A', Verein: 'B' }]);
  });
  it('ignores trailing and fully empty rows', () => {
    const r = parseCsv('A;B\n1;2\n\n;\n3;4\n\n\n');
    expect(r.rows).toHaveLength(2);
  });
  it('renames duplicate headers', () => {
    expect(parseCsv('Name,Name\na,b').columns).toEqual(['Name', 'Name 2']);
    expect(parseCsv('Name,Name,Name\na,b,c').columns).toEqual(['Name', 'Name 2', 'Name 3']);
  });
  it('pads short rows and returns empty for empty input', () => {
    expect(parseCsv('A;B\n1').rows).toEqual([{ A: '1', B: '' }]);
    expect(parseCsv('')).toEqual({ columns: [], rows: [] });
  });
});
