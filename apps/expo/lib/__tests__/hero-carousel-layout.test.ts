import {
  HERO_CAROUSEL_GAP,
  HERO_CAROUSEL_PEEK,
  activeIndexFromOffset,
  heroCarouselLayout,
} from '../hero-carousel-layout';

describe('heroCarouselLayout', () => {
  it('centers the active card with equal side insets that fit a peek plus a gap', () => {
    const layout = heroCarouselLayout(390);
    expect(layout.sideInset).toBe(HERO_CAROUSEL_PEEK + HERO_CAROUSEL_GAP);
    expect(layout.cardWidth + 2 * layout.sideInset).toBe(390);
  });

  it('snaps by one card plus the gap', () => {
    const layout = heroCarouselLayout(390);
    expect(layout.interval).toBe(layout.cardWidth + HERO_CAROUSEL_GAP);
  });

  it('positions card i at the content offset i * interval', () => {
    const layout = heroCarouselLayout(430);
    expect(layout.offsetForIndex(0)).toBe(0);
    expect(layout.offsetForIndex(2)).toBe(2 * layout.interval);
  });

  it('never returns a fractional card width', () => {
    const layout = heroCarouselLayout(393);
    expect(Number.isInteger(layout.cardWidth)).toBe(true);
    expect(Number.isInteger(layout.sideInset)).toBe(true);
  });
});

describe('activeIndexFromOffset', () => {
  it('rounds the scroll offset to the nearest card', () => {
    expect(activeIndexFromOffset(0, 300, 5)).toBe(0);
    expect(activeIndexFromOffset(149, 300, 5)).toBe(0);
    expect(activeIndexFromOffset(151, 300, 5)).toBe(1);
    expect(activeIndexFromOffset(600, 300, 5)).toBe(2);
  });

  it('clamps to the first and last card on overscroll', () => {
    expect(activeIndexFromOffset(-80, 300, 5)).toBe(0);
    expect(activeIndexFromOffset(5000, 300, 5)).toBe(4);
  });

  it('returns 0 for an empty list', () => {
    expect(activeIndexFromOffset(300, 300, 0)).toBe(0);
  });
});
