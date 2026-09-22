import { ambientWeight, wrapOffset } from '@/lib/hero-carousel-layout';

describe('hero carousel ambient weight', () => {
  it('is full when the slot is centred and gone one interval away', () => {
    expect(ambientWeight(0, 300)).toBe(1);
    expect(ambientWeight(150, 300)).toBe(0.5);
    expect(ambientWeight(-150, 300)).toBe(0.5);
    expect(ambientWeight(300, 300)).toBe(0);
    expect(ambientWeight(900, 300)).toBe(0);
  });

  it('two neighbours always add up to one while the deck moves', () => {
    const interval = 300;
    for (const offset of [0, 40, 150, 260, 300]) {
      const a = ambientWeight(wrapOffset(0 * interval - offset, 5 * interval), interval);
      const b = ambientWeight(wrapOffset(1 * interval - offset, 5 * interval), interval);
      expect(a + b).toBeCloseTo(1, 6);
    }
  });

  it('never goes negative or above one', () => {
    expect(ambientWeight(-5000, 300)).toBe(0);
    expect(ambientWeight(0, 0)).toBe(0);
  });
});
