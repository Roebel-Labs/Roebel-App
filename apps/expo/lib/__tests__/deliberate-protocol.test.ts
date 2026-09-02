import {
  approvalPercent,
  buildArgumentTree,
  derivePhase,
  formatPunkte,
  utf8ByteLength,
  MAX_CONTENT_BYTES,
  type DebateArgumentNode,
} from '../deliberate/protocol';

describe('derivePhase', () => {
  const editingEnd = 1000;
  const ratingEnd = 2000;
  it('is editing before the editing window closes', () => {
    expect(derivePhase(999, editingEnd, ratingEnd, false)).toBe('editing');
  });
  it('is rating from the editing end up to the rating end', () => {
    expect(derivePhase(1000, editingEnd, ratingEnd, false)).toBe('rating');
    expect(derivePhase(1999, editingEnd, ratingEnd, false)).toBe('rating');
  });
  it('is tallying once rating has closed but the tally has not run', () => {
    expect(derivePhase(2000, editingEnd, ratingEnd, false)).toBe('tallying');
  });
  it('is finished whenever the tally latch is set', () => {
    expect(derivePhase(500, editingEnd, ratingEnd, true)).toBe('finished');
  });
});

describe('approvalPercent', () => {
  it('reads the pro-share price as con / (pro + con)', () => {
    expect(approvalPercent(1000, 3000)).toBe(75);
  });
  it('treats an empty market as undecided', () => {
    expect(approvalPercent(0, 0)).toBe(50);
  });
});

describe('formatPunkte', () => {
  it('divides hundredths by 100 and trims whole numbers', () => {
    expect(formatPunkte(10000)).toBe('100');
  });
  it('uses a German decimal comma and trims trailing zeros', () => {
    expect(formatPunkte(1050)).toBe('10,5');
    expect(formatPunkte(1234)).toBe('12,34');
  });
  it('handles zero', () => {
    expect(formatPunkte(0)).toBe('0');
  });
});

describe('utf8ByteLength', () => {
  it('counts ASCII, umlauts, and emoji correctly', () => {
    expect(utf8ByteLength('a')).toBe(1);
    expect(utf8ByteLength('ä')).toBe(2);
    expect(utf8ByteLength('🚲')).toBe(4);
    expect(utf8ByteLength('Röbel 🚲')).toBe(11);
  });
  it('exports the 1 KiB protocol cap', () => {
    expect(MAX_CONTENT_BYTES).toBe(1024);
  });
});

describe('buildArgumentTree', () => {
  const raw = (over: Partial<Omit<DebateArgumentNode, 'children'>>): Omit<DebateArgumentNode, 'children'> => ({
    id: 0,
    parentId: null,
    creator: '0xabc',
    isSupporting: null,
    contentDigest: 'd'.repeat(64),
    finalizationTime: 0,
    pro: 500,
    con: 500,
    votes: 1000,
    rating: null,
    ...over,
  });

  it('nests children under the thesis and grandchildren under their parent', () => {
    const tree = buildArgumentTree([
      raw({}),
      raw({ id: 1, parentId: 0, isSupporting: true }),
      raw({ id: 2, parentId: 0, isSupporting: false }),
      raw({ id: 3, parentId: 1, isSupporting: false }),
    ]);
    expect(tree.id).toBe(0);
    expect(tree.children.map((c) => c.id)).toEqual([1, 2]);
    expect(tree.children[0].children.map((c) => c.id)).toEqual([3]);
    expect(tree.children[1].children).toEqual([]);
  });

  it('throws when the thesis is missing', () => {
    expect(() => buildArgumentTree([raw({ id: 1, parentId: 0 })])).toThrow();
  });
});
