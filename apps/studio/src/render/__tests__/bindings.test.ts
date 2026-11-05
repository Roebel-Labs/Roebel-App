import { describe, expect, it } from 'vitest';
import { resolveBindings } from '../bindings';
import type { RenderContext } from '../../state/types';

const rc = (over: Partial<RenderContext> = {}): RenderContext => ({
  row: { Gruppe: 'Sunshine Kids', Verein: 'TSV Röbel', Größe: '12' },
  next: { Gruppe: 'Dance Queens' },
  now: new Date(2026, 10, 7, 14, 5, 9),
  sponsor: { name: 'Bäckerei Schulz', logoUrl: 'https://x/logo.png' },
  donation: { name: 'Anna', amount: '10 €', message: 'Viel Erfolg!' },
  chatHighlight: { name: 'Lena', body: 'Super Auftritt!', avatarUrl: 'https://x/a.png' },
  ...over,
});

describe('resolveBindings', () => {
  it('resolves row columns', () => {
    expect(resolveBindings('{{row.Gruppe}} – {{row.Verein}}', rc())).toBe('Sunshine Kids – TSV Röbel');
  });

  it('missing key and null row give empty strings, never the literal or undefined', () => {
    expect(resolveBindings('A{{row.Fehlt}}B', rc())).toBe('AB');
    const out = resolveBindings('{{row.Gruppe}},{{next.Gruppe}},{{sponsor.name}},{{donation.name}}', rc({ row: null, next: null, sponsor: null, donation: null }));
    expect(out).toBe(',,,');
    expect(resolveBindings('{{unbekannt}}{{row}}', rc())).toBe('');
  });

  it('formats {{time}} as HH:MM local', () => {
    expect(resolveBindings('{{time}}', rc())).toBe('14:05');
  });

  it('tolerates spaces, keeps case sensitivity, supports umlaut keys', () => {
    expect(resolveBindings('{{ row.Gruppe }}', rc())).toBe('Sunshine Kids');
    expect(resolveBindings('{{row.gruppe}}', rc())).toBe('');
    expect(resolveBindings('{{row.Größe}}', rc())).toBe('12');
  });

  it('resolves next, sponsor and donation bindings', () => {
    expect(resolveBindings('Als Nächstes: {{next.Gruppe}}', rc())).toBe('Als Nächstes: Dance Queens');
    expect(resolveBindings('{{sponsor.name}} {{sponsor.logo}}', rc())).toBe('Bäckerei Schulz https://x/logo.png');
    expect(resolveBindings('{{donation.name}} unterstützt mit {{donation.amount}}: {{donation.message}}', rc())).toBe(
      'Anna unterstützt mit 10 €: Viel Erfolg!',
    );
  });

  it('drops separators left dangling by empty bindings', () => {
    expect(resolveBindings('{{row.Verein}} · {{row.Kategorie}}', rc({ row: null }))).toBe('');
    expect(resolveBindings('{{row.Verein}} · {{row.Kategorie}}', rc({ row: { Verein: 'TSV Röbel' } }))).toBe('TSV Röbel');
    expect(resolveBindings('{{row.Kategorie}} – {{row.Verein}}', rc({ row: { Verein: 'TSV Röbel' } }))).toBe('TSV Röbel');
    expect(resolveBindings('{{row.A}} · {{row.B}} · {{row.Verein}}', rc({ row: { Verein: 'X' } }))).toBe('X');
  });

  it('leaves text without bindings untouched', () => {
    expect(resolveBindings(' · Literal · ', rc())).toBe(' · Literal · ');
    expect(resolveBindings("Gleich geht's weiter", rc())).toBe("Gleich geht's weiter");
  });

  it('resolves chat highlight bindings, and empty without a highlight', () => {
    expect(resolveBindings('{{chat.name}}: {{chat.body}}', rc())).toBe('Lena: Super Auftritt!');
    expect(resolveBindings('{{chat.avatar}}', rc())).toBe('https://x/a.png');
    expect(resolveBindings('{{chat.name}} · {{chat.body}}', rc({ chatHighlight: null }))).toBe('');
    expect(resolveBindings('{{chat.unknown}}', rc())).toBe('');
  });
});
