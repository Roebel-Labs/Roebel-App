import { contrastPillBottom, CONTRAST_PILL_HEIGHT } from '../contrast-pill';
import { glassBarFootprint, GLASS_PILL_TOP_GAP } from '../glass-tab-geometry';

describe('contrast pill placement', () => {
  it('floats 12 pt above the visible glass bar on home-indicator phones', () => {
    expect(contrastPillBottom(34)).toBe(glassBarFootprint(34) - GLASS_PILL_TOP_GAP + 12);
  });
  it('floats 12 pt above the visible glass bar without a home indicator', () => {
    expect(contrastPillBottom(0)).toBe(glassBarFootprint(0) - GLASS_PILL_TOP_GAP + 12);
  });
  it('is 44 pt tall', () => {
    expect(CONTRAST_PILL_HEIGHT).toBe(44);
  });
});
