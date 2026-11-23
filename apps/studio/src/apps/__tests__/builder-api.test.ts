import { describe, expect, it } from 'vitest';
import { errorText, extractResult, makeFrameParser, previewDoc, screensOf, stripFences } from '../builder-api';

describe('builder stream helpers', () => {
  it('parses NDJSON frames across chunk borders', () => {
    const got: string[] = [];
    const feed = makeFrameParser((f) => got.push(`${f.t}:${f.v ?? ''}`));
    feed('{"t":"ping"}\n{"t":"ht');
    feed('ml","v":"<!do"}\n{"t":"html","v":"ctype"}\nnot json\n');
    expect(got).toEqual(['ping:', 'html:<!do', 'html:ctype']);
  });

  it('strips fences and splits NOTES', () => {
    const raw = '```html\n<!doctype html><html><body></body></html>\n<!--NOTES: Gebaut.-->\n```';
    expect(stripFences(raw).startsWith('<!doctype html>')).toBe(true);
    expect(extractResult(raw)).toEqual({ html: '<!doctype html><html><body></body></html>', notes: 'Gebaut.' });
  });

  it('rejects a truncated document', () => {
    expect(extractResult('<!doctype html><html><body>').truncated).toBe(true);
    expect(extractResult('Sorry, I cannot').html).toBeNull();
  });

  it('injects a base tag for the preview', () => {
    expect(previewDoc('<html><head><title>x</title></head></html>', 'https://www.roebel.app')).toContain(
      '<head><base href="https://www.roebel.app/"><title>',
    );
  });

  it('lists screens with titles', () => {
    const html = '<main><section data-screen="a" data-title="Start" class="active"></section><section data-screen="b"></section></main>';
    expect(screensOf(html)).toEqual([
      { slug: 'a', title: 'Start' },
      { slug: 'b', title: 'b' },
    ]);
  });

  it('maps API errors to readable text', () => {
    expect(errorText({ error: 'Zu viele Anfragen von deinem Anschluss.', code: 'rate_limited' }, 429)).toBe('Zu viele Anfragen von deinem Anschluss.');
    expect(errorText({ ok: false, error: 'slug_taken', errorCode: 'slug_taken' }, 409)).toMatch(/Kurzname/);
    expect(errorText({ error: 'invalid_body' }, 400)).toMatch(/400/);
  });
});

import { rowTable, toCsv } from '../builder-api';

describe('owner data table', () => {
  it('flattens data and private fields into columns and writes Excel-friendly CSV', () => {
    const { columns, cells } = rowTable([
      { id: '1', key: 'raum1|2026-12-01|14:00', data: { raum: 'raum1' }, privateData: { name: 'Lea; "L"' }, mine: false, createdAt: '2026-11-23T10:00:00Z' },
      { id: '2', key: null, data: { raum: 'kueche', extra: { a: 1 } }, mine: false, createdAt: '2026-11-23T11:00:00Z' },
    ]);
    expect(columns).toEqual(['Schlüssel', 'raum', 'extra', 'name (privat)', 'Erstellt']);
    expect(cells[1].slice(0, 4)).toEqual(['', 'kueche', '{"a":1}', '']);
    const csv = toCsv(columns, cells);
    expect(csv.startsWith('﻿Schlüssel;raum')).toBe(true);
    expect(csv).toContain('"Lea; ""L"""');
  });
});

import { audienceFor } from '../builder-api';

describe('audience choice', () => {
  it('maps the publish-sheet choice to manifest org/audience', () => {
    expect(audienceFor(null, 'required')).toEqual({ org: undefined, audience: undefined });
    expect(audienceFor('abc', 'recommended')).toEqual({ org: 'abc', audience: { mode: 'recommended', anyOf: ['org:abc'] } });
  });
});
