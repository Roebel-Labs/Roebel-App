import { describe, expect, it } from 'vitest';
import { decodeText, parseCsv } from '../csv';

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
    expect(parseCsv('')).toEqual({ columns: [], rows: [], overflowRows: 0 });
  });
  it('detects the delimiter after leading blank lines', () => {
    expect(parseCsv('\n  \nA;B\n1;2').columns).toEqual(['A', 'B']);
  });
  it('keeps commas in a single-column file', () => {
    const r = parseCsv('Name\nKinder, 6–9 Jahre\nTeens');
    expect(r.columns).toEqual(['Name']);
    expect(r.rows.map((x) => x.Name)).toEqual(['Kinder, 6–9 Jahre', 'Teens']);
  });
  it('drops an empty trailing column and names a populated nameless one', () => {
    expect(parseCsv('A;B;\n1;2;').columns).toEqual(['A', 'B']);
    const r = parseCsv('A;B;\n1;2;x');
    expect(r.columns).toEqual(['A', 'B', 'Spalte 3']);
    expect(r.rows[0]['Spalte 3']).toBe('x');
  });
  it('counts rows with values beyond the header', () => {
    const r = parseCsv('A;B\n1;2;3\n4;5\n6;7;8;9');
    expect(r.overflowRows).toBe(2);
    expect(r.rows[0]).toEqual({ A: '1', B: '2' });
  });
  it('keeps CRLF inside a quoted field', () => {
    expect(parseCsv('A;B\r\n"l1\r\nl2";x\r\n').rows).toEqual([{ A: 'l1\r\nl2', B: 'x' }]);
  });
  it('decodes UTF-8 and falls back to Windows-1252', () => {
    expect(decodeText(new TextEncoder().encode('Röbel').buffer as ArrayBuffer)).toBe('Röbel');
    expect(decodeText(new Uint8Array([0x52, 0xf6, 0x62, 0x65, 0x6c]).buffer)).toBe('Röbel');
  });
});
