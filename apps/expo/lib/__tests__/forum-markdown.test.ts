import { markdownToSnippet } from '../forum-markdown';

describe('markdownToSnippet', () => {
  it('drops heading marks, keeps list bullets readable, unwraps emphasis and links', () => {
    const md = '#### Empfehlung des Bürgerrats\nDer Rat **empfiehlt** [mehr](https://x.y).\n\n- Punkt eins\n  - Unterpunkt\n![bild](https://img)';
    expect(markdownToSnippet(md)).toBe(
      'Empfehlung des Bürgerrats\nDer Rat empfiehlt mehr.\n• Punkt eins\n• Unterpunkt',
    );
  });
  it('leaves plain text untouched', () => {
    expect(markdownToSnippet('Einfacher Text.')).toBe('Einfacher Text.');
  });
});
