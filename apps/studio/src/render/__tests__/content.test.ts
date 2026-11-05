import { describe, expect, it } from 'vitest';
import { templateHasContent } from '../draw';
import { starterTemplates } from '../templates';
import type { RenderContext, Template } from '../../state/types';

const rc = (over: Partial<RenderContext> = {}): RenderContext => ({
  row: null,
  next: null,
  now: new Date(2026, 10, 7, 19, 5),
  sponsor: null,
  donation: null,
  ...over,
});
const byKind = (k: Template['kind']) => starterTemplates().find((t) => t.kind === k)!;

describe('templateHasContent', () => {
  it('hides a lower third whose bindings are all empty', () => {
    expect(templateHasContent(byKind('lowerThird'), rc())).toBe(false);
    expect(templateHasContent(byKind('lowerThird'), rc({ row: { Gruppe: '', Verein: '' } }))).toBe(false);
  });

  it('shows a lower third as soon as one binding has data', () => {
    expect(templateHasContent(byKind('lowerThird'), rc({ row: { Gruppe: 'Wirbelwind' } }))).toBe(true);
    expect(templateHasContent(byKind('lowerThird'), rc({ row: { Verein: 'TSV Röbel' } }))).toBe(true);
  });

  it('hides "next up" when there is no next row even though it has static text', () => {
    expect(templateHasContent(byKind('nextUp'), rc())).toBe(false);
    expect(templateHasContent(byKind('nextUp'), rc({ next: { Gruppe: 'Sternchen' } }))).toBe(true);
  });

  it('always shows templates with only static text or the clock', () => {
    expect(templateHasContent(byKind('logoBug'), rc())).toBe(true);
    expect(templateHasContent(byKind('clock'), rc())).toBe(true);
  });

  it('never hides full-screen templates', () => {
    expect(templateHasContent(byKind('pause'), rc())).toBe(true);
    expect(templateHasContent(byKind('breakSpot'), rc())).toBe(true);
  });

  it('a template without text nodes counts as content', () => {
    const t: Template = { ...byKind('logoBug'), nodes: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#fff' }] };
    expect(templateHasContent(t, rc())).toBe(true);
  });
});
