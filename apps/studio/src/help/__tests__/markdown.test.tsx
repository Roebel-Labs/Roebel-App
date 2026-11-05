import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkdown, parseInline, toSections, safeHref, slugify } from '../markdown';
import { HelpView } from '../HelpTab';
import guide from '../../../../../docs/STUDIO_RUNBOOK.md?raw';

describe('markdown parser', () => {
  it('headings get stable unique ids (umlauts transliterated)', () => {
    const b = parseMarkdown('## Größe\n\n## Größe\n\n### Über uns');
    expect(b.map((x) => (x.t === 'heading' ? x.id : ''))).toEqual(['groesse', 'groesse-2', 'ueber-uns']);
    expect(slugify('Ziel neu verbinden!')).toBe('ziel-neu-verbinden');
  });

  it('parses code blocks verbatim, lists and checkboxes', () => {
    const b = parseMarkdown('```bash\nbrew install **x**\n```\n\n- a\n- [ ] b\n  weiter\n\n1. eins\n2. zwei');
    expect(b[0]).toEqual({ t: 'code', lang: 'bash', v: 'brew install **x**' });
    expect(b[1]).toMatchObject({ t: 'list', ordered: false });
    expect(b[1].t === 'list' && b[1].items[1].checked).toBe(false);
    expect(b[2]).toMatchObject({ t: 'list', ordered: true });
  });

  it('parses tables', () => {
    const b = parseMarkdown('| A | B |\n|---|---|\n| 1 | **2** |');
    expect(b[0]).toMatchObject({ t: 'table' });
    expect(b[0].t === 'table' && b[0].rows).toHaveLength(1);
  });

  it('inline: bold, italic, code, links; unsafe link targets lose the link', () => {
    expect(parseInline('**a** *b* `c`').map((n) => n.t)).toEqual(['strong', 'text', 'em', 'text', 'code']);
    expect(parseInline('[x](javascript:alert(1))').some((n) => n.t === 'link')).toBe(false);
    expect(safeHref('https://a.de')).toBe('https://a.de');
    expect(safeHref('file:///etc/passwd')).toBeNull();
    expect(safeHref('#abschnitt')).toBe('#abschnitt');
  });

  it('sections split at h2 and collect h3 for the TOC', () => {
    const s = toSections(parseMarkdown('# T\n\nintro\n\n## A\n\n### A1\n\ntext\n\n## B\n\nmehr'));
    expect(s.map((x) => x.title)).toEqual(['Einleitung', 'A', 'B']);
    expect(s[1].subs).toEqual([{ id: 'a1', title: 'A1' }]);
  });
});

describe('HelpView', () => {
  it('renders raw HTML in markdown as text, never as elements', () => {
    const html = renderToStaticMarkup(
      <HelpView source={'# T\n\n## S\n\n<script>alert(1)</script> und <img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))'} />,
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
  });

  it('renders the bundled guide with a table of contents and no leftover event specifics', () => {
    const html = renderToStaticMarkup(<HelpView source={guide} />);
    expect(html).toContain('class="toc-h2"');
    expect(html).toContain('id="sendeziele"');
    expect(html).not.toMatch(/DanceCup|Cloudflare-Input/);
  });
});
