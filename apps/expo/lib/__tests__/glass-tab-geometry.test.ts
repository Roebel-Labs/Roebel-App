import {
  GLASS_HIGHLIGHT_HEIGHT,
  GLASS_PILL_INSET,
  glassBarFootprint,
  glassHighlightX,
  glassPillBottomGap,
  glassPillInnerWidth,
  glassTabWidth,
} from '../glass-tab-geometry';

// Standard bar: 78 content + max(insets.bottom, 8).
const standardFootprint = (inset: number) => 78 + Math.max(inset, 8);

describe('glass tab geometry', () => {
  it('splits the inner width evenly between tabs', () => {
    expect(glassTabWidth(338, 3)).toBeCloseTo((338 - GLASS_PILL_INSET * 2) / 3);
    expect(glassTabWidth(0, 3)).toBe(0);
    expect(glassTabWidth(300, 0)).toBe(0);
  });

  it('places the highlight under the active tab', () => {
    const w = 338;
    const tab = glassTabWidth(w, 3);
    expect(glassHighlightX(w, 3, 0)).toBe(GLASS_PILL_INSET);
    expect(glassHighlightX(w, 3, 1)).toBeCloseTo(GLASS_PILL_INSET + tab);
    expect(glassHighlightX(w, 3, 2)).toBeCloseTo(GLASS_PILL_INSET + tab * 2);
    // highlight of the last tab ends exactly at the inner inset
    expect(glassHighlightX(w, 3, 2) + tab).toBeCloseTo(w - GLASS_PILL_INSET);
  });

  it('clamps out-of-range indexes', () => {
    expect(glassHighlightX(300, 3, -1)).toBe(glassHighlightX(300, 3, 0));
    expect(glassHighlightX(300, 3, 7)).toBe(glassHighlightX(300, 3, 2));
  });

  it('keeps a minimum gap under the pill without a home indicator', () => {
    expect(glassPillBottomGap(0)).toBe(12);
  });

  it('sits fully above the safe area', () => {
    for (const inset of [16, 24, 34, 48]) expect(glassPillBottomGap(inset)).toBeGreaterThan(inset);
  });

  it('never takes more room than the standard bar (hosts keep their padding)', () => {
    for (const inset of [0, 8, 16, 24, 34, 48]) {
      expect(glassBarFootprint(inset)).toBeLessThanOrEqual(standardFootprint(inset));
    }
  });

  it('derives the inner width from the window', () => {
    expect(glassPillInnerWidth(412)).toBe(412 - 40 - 2);
    expect(glassPillInnerWidth(10)).toBe(0);
  });

  it('highlight fits inside the pill', () => {
    expect(GLASS_HIGHLIGHT_HEIGHT).toBe(58);
  });
});
