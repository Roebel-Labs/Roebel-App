import { describe, expect, it } from 'vitest';
import type { LibraryFile, Suggestion, SuggestionSection } from '../../workspace/api';
import {
  allSuggestions, citationRuns, filterLibrary, filterSuggestionSections, foldCitations, friendlyError, makeSchedule, matchesQuery, parseSkillFile, prepareWikiMarkdown,
  scheduleText, splitCitations, suggestionFilters, suggestionSections, wikiSlugOf,
} from '../format';
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

describe('citation runs', () => {
  it('joins adjacent markers into one run and pulls it onto the word', () => {
    expect(citationRuns('Fehler auf main [[1]] [[2]][[3]], [[4]]. Weiter[[5]] und Ende.')).toEqual([
      'Fehler auf main', { ns: [1, 2, 3, 4] }, '. Weiter', { ns: [5] }, ' und Ende.',
    ]);
    expect(citationRuns('ohne')).toEqual(['ohne']);
    expect(citationRuns('[[2]] [[2]] vorn')).toEqual([{ ns: [2] }, ' vorn']);
  });

  it('keeps text between markers that is not a separator', () => {
    expect(citationRuns('A[[1]] und B[[2]]')).toEqual(['A', { ns: [1] }, ' und B', { ns: [2] }]);
  });

  it('shows at most two marks and folds a longer run into "+N"', () => {
    expect(foldCitations([7])).toEqual({ shown: [7], folded: [] });
    expect(foldCitations([1, 2])).toEqual({ shown: [1, 2], folded: [] });
    expect(foldCitations([1, 2, 3, 4])).toEqual({ shown: [1], folded: [2, 3, 4] });
  });
});

describe('suggestion sections', () => {
  const sug = (id: string, over: Partial<Suggestion> = {}): Suggestion => ({ id, kind: 'task', title: id, reason: '', prompt: '', schedule: null, people: [], ...over });
  const sections: SuggestionSection[] = [
    { key: 'projects', title: '', groups: [{ title: 'Roebel-App', items: [sug('a', { quick: true, fresh: true }), sug('b', { kind: 'routine', quick: true })] }, { title: 'Allgemein', items: [sug('c')] }] },
    { key: 'collab', title: 'Zusammenarbeit', groups: [{ title: 'Aufgabe abstimmen', items: [sug('d', { fresh: true }), sug('a', { quick: true, fresh: true })] }] },
  ];

  it('falls back to the old groups when the backend sends no sections', () => {
    const groups = [{ title: 'Allgemein', items: [sug('x')] }];
    expect(suggestionSections({ groups })).toEqual([{ key: 'projects', title: '', groups }]);
    expect(suggestionSections({ sections, groups })).toHaveLength(2);
    expect(suggestionSections({ groups: [] })).toEqual([]);
    expect(suggestionSections(null)).toEqual([]);
  });

  it('builds the filter list per contract', () => {
    expect(suggestionFilters(sections, true).map((f) => f.id)).toEqual(['all', 'quick', 'routine', 'section:collab']);
    expect(suggestionFilters(sections, true)[3].label).toBe('Zusammenarbeit');
    expect(suggestionFilters(sections, false).map((f) => f.label)).toEqual(['Alle', 'Aufgaben', 'Routinen']);
  });

  it('filters by quick tasks, routines, section, hidden and fresh', () => {
    const ids = (f: string, o = {}) => allSuggestions(filterSuggestionSections(sections, f, o)).map((i) => i.id);
    expect(ids('all')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('quick')).toEqual(['a']);
    expect(ids('routine')).toEqual(['b']);
    expect(ids('section:collab')).toEqual(['d', 'a']);
    expect(ids('all', { onlyFresh: true })).toEqual(['a', 'd']);
    expect(ids('all', { hidden: new Set(['a', 'c']) })).toEqual(['b', 'd']);
    // Empty groups and sections disappear.
    expect(filterSuggestionSections(sections, 'routine').map((s) => s.groups.map((g) => g.title))).toEqual([['Roebel-App']]);
  });
});

describe('search match', () => {
  it('needs every word, in any field, in any case', () => {
    expect(matchesQuery('', 'x')).toBe(true);
    expect(matchesQuery('wochen support', 'Wöchentliche Durchsicht', 'offener Support-Themen')).toBe(false);
    expect(matchesQuery('durchsicht SUPPORT', 'Wöchentliche Durchsicht', 'offener Support-Themen')).toBe(true);
    expect(matchesQuery('fehlt', 'Titel', null)).toBe(false);
  });
});
