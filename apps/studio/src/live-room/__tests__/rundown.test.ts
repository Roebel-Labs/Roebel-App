import { describe, expect, it } from 'vitest';
import type { Table } from '../../state/types';
import { guessColumnMap, mapRowsToItems, parsePlannedAt, resolveItemForRow, sanitizeColumnMap, tableToRundown } from '../rundown';

const table: Table = {
  columns: ['Nr', 'Gruppe', 'Verein', 'Kategorie', 'Tanz', 'Zeit'],
  rows: [
    { id: 'r1', values: { Nr: '1', Gruppe: 'Sonnenschein', Verein: 'TSV Röbel', Kategorie: 'Kinder', Tanz: 'Jazz', Zeit: '14:05' } },
    { id: 'r2', values: { Nr: '2', Gruppe: '  ', Verein: 'Leer', Kategorie: '', Tanz: '', Zeit: '' } },
    { id: 'r3', values: { Nr: '3', Gruppe: 'Wirbelwind', Verein: 'SV Malchow', Kategorie: '', Tanz: '', Zeit: '9 Uhr' } },
  ],
  currentRowId: 'r1',
};

describe('guessColumnMap', () => {
  it('finds title, subtitle columns, detail and time by name', () => {
    expect(guessColumnMap(table.columns)).toEqual({ title: 'Gruppe', subtitle: ['Verein', 'Kategorie'], detail: 'Tanz', time: 'Zeit' });
  });
  it('falls back to the first column as title', () => {
    expect(guessColumnMap(['A', 'B']).title).toBe('A');
    expect(guessColumnMap([]).title).toBeNull();
  });
  it('drops renamed columns', () => {
    expect(sanitizeColumnMap({ title: 'Gruppe', subtitle: ['Verein', 'Weg'], detail: 'Weg', time: null }, ['Gruppe', 'Verein'])).toEqual({
      title: 'Gruppe',
      subtitle: ['Verein'],
      detail: null,
      time: null,
    });
  });
});

describe('parsePlannedAt', () => {
  const base = new Date(2026, 10, 7, 12, 0);
  it('reads clock times on the base day', () => {
    expect(parsePlannedAt('14:05', base)).toBe(new Date(2026, 10, 7, 14, 5).toISOString());
    expect(parsePlannedAt('9.30 Uhr', base)).toBe(new Date(2026, 10, 7, 9, 30).toISOString());
    expect(parsePlannedAt('9 Uhr', base)).toBe(new Date(2026, 10, 7, 9, 0).toISOString());
  });
  it('rejects junk and bare numbers', () => {
    expect(parsePlannedAt('', base)).toBeNull();
    expect(parsePlannedAt('12', base)).toBeNull();
    expect(parsePlannedAt('25:00', base)).toBeNull();
    expect(parsePlannedAt('später', base)).toBeNull();
  });
});

describe('tableToRundown', () => {
  it('maps rows, joins subtitles and skips rows without title', () => {
    const map = guessColumnMap(table.columns);
    const { rows, rowIds } = tableToRundown(table, map, new Date(2026, 10, 7));
    expect(rowIds).toEqual(['r1', 'r3']);
    expect(rows[0]).toEqual({ title: 'Sonnenschein', subtitle: 'TSV Röbel · Kinder', detail: 'Jazz', planned_at: new Date(2026, 10, 7, 14, 5).toISOString() });
    expect(rows[1]).toEqual({ title: 'Wirbelwind', subtitle: 'SV Malchow', detail: null, planned_at: new Date(2026, 10, 7, 9, 0).toISOString() });
  });
  it('returns nothing without a title column', () => {
    expect(tableToRundown(table, { title: null, subtitle: [], detail: null, time: null }, new Date()).rows).toEqual([]);
  });
});

describe('row ↔ item mapping', () => {
  it('pairs by server position', () => {
    expect(mapRowsToItems(['r1', 'r3'], [{ id: 'b', position: 1 }, { id: 'a', position: 0 }, { id: 'x', position: 5 }])).toEqual({ r1: 'a', r3: 'b' });
  });
  it('uses the stored mapping while that item exists, else a unique title match', () => {
    const map = guessColumnMap(table.columns);
    const items = [
      { id: 'i1', title: 'sonnenschein ' },
      { id: 'i3', title: 'Wirbelwind' },
    ];
    expect(resolveItemForRow('r1', { r1: 'i1' }, table, map, items)).toBe('i1');
    expect(resolveItemForRow('r1', { r1: 'gone' }, table, map, items)).toBe('i1');
    expect(resolveItemForRow('r3', {}, table, map, items)).toBe('i3');
    expect(resolveItemForRow('r3', {}, table, map, [...items, { id: 'dup', title: 'Wirbelwind' }])).toBeNull();
    expect(resolveItemForRow('r2', {}, table, map, items)).toBeNull();
    // Rundown not loaded yet: trust the stored mapping.
    expect(resolveItemForRow('r1', { r1: 'i1' }, table, map, [])).toBe('i1');
  });
});
