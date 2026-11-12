import { describe, expect, it } from 'vitest';
import type { LibraryFile } from '../../workspace/api';
import { filterLibrary, friendlyError, makeSchedule, parseSkillFile, prepareWikiMarkdown, scheduleText, splitCitations, wikiSlugOf } from '../format';
import { parseInline } from '../../help/markdown';

describe('schedule text', () => {
  it('writes weekly and daily schedules in German', () => {
    expect(scheduleText({ kind: 'weekly', weekday: 1, hour: 8, minute: 0, tz: 'Europe/Berlin' })).toBe('Jeden Montag, 08:00');
    expect(scheduleText({ kind: 'weekly', weekday: 0, hour: 18, minute: 5, tz: 'Europe/Berlin' })).toBe('Jeden Sonntag, 18:05');
    expect(scheduleText({ kind: 'daily', hour: 7, minute: 30, tz: 'Europe/Berlin' })).toBe('Täglich, 07:30');
    expect(scheduleText(null)).toBe('');
  });

  it('builds a schedule from the dialog fields', () => {
    expect(makeSchedule('weekly', 3, '09:15')).toEqual({ kind: 'weekly', weekday: 3, hour: 9, minute: 15, tz: 'Europe/Berlin' });
    expect(makeSchedule('daily', 3, '07:30')).toEqual({ kind: 'daily', hour: 7, minute: 30, tz: 'Europe/Berlin' });
    expect(makeSchedule('daily', 0, '')).toEqual({ kind: 'daily', hour: 8, minute: 0, tz: 'Europe/Berlin' });
  });
});

describe('SKILL.md upload', () => {
  it('reads name and description from the frontmatter', () => {
    const r = parseSkillFile('---\nname: "Protokoll"\ndescription: Schreibt Sitzungsprotokolle\n---\n\n# Ablauf\nSchritt 1', 'SKILL.md');
    expect(r).toEqual({ name: 'Protokoll', description: 'Schreibt Sitzungsprotokolle', body: '# Ablauf\nSchritt 1' });
  });

  it('falls back to the first heading, then the file name', () => {
    expect(parseSkillFile('# Angebote\nText', 'x.md').name).toBe('Angebote');
    expect(parseSkillFile('Nur Text', 'angebote.md').name).toBe('angebote');
    expect(parseSkillFile('Nur Text', 'SKILL.md').name).toBe('');
  });
});

describe('wiki markdown', () => {
  it('keeps wiki links as in-page anchors and nothing else', () => {
    const md = prepareWikiMarkdown('Siehe [Ziele](wiki:goals) und [Anne](wiki:person-12ab) oder [böse](javascript:alert(1)).');
    const links = parseInline(md).filter((n) => n.t === 'link') as Array<{ href: string }>;
    expect(links.map((l) => wikiSlugOf(l.href))).toEqual(['goals', 'person-12ab']);
    expect(wikiSlugOf('https://example.org')).toBeNull();
  });

  it('splits citation markers', () => {
    expect(splitCitations('Wohnt in Röbel[[1]] und arbeitet viel[[12]].')).toEqual(['Wohnt in Röbel', { n: 1 }, ' und arbeitet viel', { n: 12 }, '.']);
    expect(splitCitations('ohne')).toEqual(['ohne']);
  });
});

describe('library filter', () => {
  const file = (over: Partial<LibraryFile>): LibraryFile => ({
    id: '1', name: 'Bericht.md', ext: 'md', size: 10, kind: 'document', url: null, threadId: 't1', threadTitle: 'Planung', routineTitle: null, createdAt: '2026-11-12T08:00:00Z', ...over,
  });
  const files = [file({}), file({ id: '2', name: 'Foto.jpg', kind: 'image', threadId: 't2', threadTitle: 'Fotos', routineTitle: 'Wochenblick' })];

  it('filters by collection, kind and search', () => {
    expect(filterLibrary(files, 'recent', 'all', '')).toHaveLength(2);
    expect(filterLibrary(files, 'thread:t1', 'all', '').map((f) => f.id)).toEqual(['1']);
    expect(filterLibrary(files, 'routine:Wochenblick', 'all', '').map((f) => f.id)).toEqual(['2']);
    expect(filterLibrary(files, 'recent', 'image', '').map((f) => f.id)).toEqual(['2']);
    expect(filterLibrary(files, 'recent', 'all', 'planung').map((f) => f.id)).toEqual(['1']);
  });
});

describe('friendly errors', () => {
  it('explains an endpoint that is not deployed yet', () => {
    expect(friendlyError({ status: 404, code: 'failed', message: 'Fehler 404' })).toMatch(/noch nicht verfügbar/);
    expect(friendlyError({ status: 404, code: 'not_found', message: 'Seite nicht gefunden.' })).toBe('Seite nicht gefunden.');
    expect(friendlyError({ status: 0, code: 'network', message: 'Server nicht erreichbar.' })).toBe('Server nicht erreichbar.');
  });
});
