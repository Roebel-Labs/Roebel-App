import {
  allSuggestions,
  briefingDocForViewer,
  briefingLabel,
  briefingPlainText,
  greeting,
  normalizeBriefing,
  normalizeStatus,
  scheduleText,
  suggestionRows,
  suggestionSections,
  visibleSections,
  type Suggestion,
  type SuggestionSection,
} from '../persona';

const sug = (id: string, over: Partial<Suggestion> = {}): Suggestion => ({
  id, kind: 'task', title: `Titel ${id}`, reason: 'weil', prompt: 'mach', schedule: null, people: [], ...over,
});

const SECTIONS: SuggestionSection[] = [
  { key: 'projects', title: '', groups: [
    { title: 'Heute', items: [sug('a', { quick: true }), sug('b', { kind: 'routine', schedule: { kind: 'daily', hour: 7, minute: 30, tz: 'Europe/Berlin' } })] },
    { title: 'Allgemein', items: [sug('c')] },
  ] },
  { key: 'collab', title: 'Zusammenarbeit', groups: [{ title: 'Team', items: [sug('a', { quick: true }), sug('d', { quick: true, kind: 'routine' })] }] },
];

describe('suggestionSections', () => {
  it('reads v2 sections and drops broken or empty parts', () => {
    const out = suggestionSections({
      sections: [
        { key: 'projects', title: null as never, groups: [{ title: 'Heute', items: [sug('a'), null as never, { id: 1 } as never] }, { title: 'Leer', items: [] }] },
        { key: 'peers', title: 'Für Menschen wie dich', groups: null as never },
      ],
      groups: [{ title: 'alt', items: [sug('z')] }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('');
    expect(out[0].groups).toHaveLength(1);
    expect(out[0].groups[0].items.map((i) => i.id)).toEqual(['a']);
  });

  it('wraps v1 groups as the untitled projects section', () => {
    const out = suggestionSections({ groups: [{ title: 'Allgemein', items: [sug('a')] }] });
    expect(out).toEqual([{ key: 'projects', title: '', groups: [{ title: 'Allgemein', items: [sug('a')] }] }]);
  });

  it('is empty for nothing', () => {
    expect(suggestionSections(null)).toEqual([]);
    expect(suggestionSections({})).toEqual([]);
    expect(suggestionSections({ sections: [] })).toEqual([]);
  });

  it('repairs a suggestion with missing fields', () => {
    const out = suggestionSections({ groups: [{ title: 'x', items: [{ id: 'a', title: 'T', kind: 'weird' } as never] }] });
    expect(out[0].groups[0].items[0]).toEqual({ id: 'a', title: 'T', kind: 'task', reason: '', prompt: '', schedule: null, people: [] });
  });
});

describe('listing suggestions', () => {
  it('lists every suggestion once', () => {
    expect(allSuggestions(SECTIONS).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('hides started items and empties', () => {
    const out = visibleSections(SECTIONS, new Set(['c', 'a', 'd']));
    expect(out).toHaveLength(1);
    expect(out[0].groups.map((g) => g.title)).toEqual(['Heute']);
    expect(out[0].groups[0].items.map((i) => i.id)).toEqual(['b']);
  });

  it('filters quick tasks and routines', () => {
    expect(allSuggestions(visibleSections(SECTIONS, new Set(), 'quick')).map((s) => s.id)).toEqual(['a']);
    expect(allSuggestions(visibleSections(SECTIONS, new Set(), 'routine')).map((s) => s.id)).toEqual(['b', 'd']);
    expect(visibleSections(SECTIONS, new Set(['a']), 'quick')).toEqual([]);
  });

  it('flattens to rows with headings as in Studio', () => {
    const rows = suggestionRows(SECTIONS);
    expect(rows.map((r) => (r.type === 'item' ? `item:${r.item.id}` : `${r.type}:${r.title}`))).toEqual([
      'group:Heute', 'item:a', 'item:b', 'group:Allgemein', 'item:c',
      'section:Zusammenarbeit', 'group:Team', 'item:a', 'item:d',
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(suggestionRows([])).toEqual([]);
  });
});

describe('briefing helpers', () => {
  it('normalizes a partial briefing', () => {
    expect(normalizeBriefing(null)).toEqual({ name: null, date: null, items: [], suggestions: [], doc: null, title: null });
    const b = normalizeBriefing({
      name: ' Max ', doc: '  ', title: '',
      items: [{ label: 'Rechnung:', text: 'offen', task: sug('a') }, { label: 'x', text: '  ' }, null as never, { text: 'ohne Label' } as never],
      suggestions: [sug('a'), null as never],
    });
    expect(b.name).toBe('Max');
    expect(b.doc).toBeNull();
    expect(b.title).toBeNull();
    expect(b.items).toHaveLength(2);
    expect(b.items[0].task?.id).toBe('a');
    expect(b.items[1]).toEqual({ label: '', text: 'ohne Label', task: null });
    expect(b.suggestions.map((s) => s.id)).toEqual(['a']);
  });

  it('normalizes the wiki status', () => {
    expect(normalizeStatus(null)).toEqual({ state: 'empty', stageLabel: null, progress: 0, error: null, builtAt: null, sources: { google: false, imports: 0 } });
    expect(normalizeStatus({ state: 'building', progress: 7 }).progress).toBe(1);
    expect(normalizeStatus({ state: 'weird' as never }).state).toBe('empty');
    expect(normalizeStatus({ state: 'ready', sources: { google: true, imports: 2 } }).sources).toEqual({ google: true, imports: 2 });
  });

  it('formats schedules', () => {
    expect(scheduleText({ kind: 'weekly', weekday: 1, hour: 8, minute: 0, tz: 'Europe/Berlin' })).toBe('Jeden Montag, 08:00');
    expect(scheduleText({ kind: 'weekly', weekday: 0, hour: 9, minute: 5, tz: 'Europe/Berlin' })).toBe('Jeden Sonntag, 09:05');
    expect(scheduleText({ kind: 'daily', hour: 7, minute: 30, tz: 'Europe/Berlin' })).toBe('Täglich, 07:30');
    expect(scheduleText(null)).toBe('');
  });

  it('greets by the hour', () => {
    expect(greeting(6)).toBe('Guten Morgen');
    expect(greeting(11)).toBe('Guten Tag');
    expect(greeting(18)).toBe('Guten Abend');
    expect(greeting(2)).toBe('Hallo');
  });

  it('cleans labels and inline markdown', () => {
    expect(briefingLabel('Rechnungen: ')).toBe('Rechnungen');
    expect(briefingLabel(null)).toBe('');
    expect(briefingPlainText('**Hetzner** will [die Rechnung](https://x.y) bis *Freitag* [[3]]')).toBe('Hetzner will die Rechnung bis Freitag');
    expect(briefingPlainText('Frag [Anna](wiki:anna-b) und [[anna|Anna B.]]')).toBe('Frag Anna und Anna B.');
    expect(briefingPlainText(undefined)).toBe('');
  });

  it('prepares the full briefing for the viewer', () => {
    expect(briefingDocForViewer('## Heute\n[Anna](wiki:anna) schreibt [hier](https://a.b) [[2]]')).toBe('## Heute\nAnna schreibt [hier](https://a.b) ');
  });
});
