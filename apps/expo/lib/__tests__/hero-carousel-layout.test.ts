import {
  HERO_CAROUSEL_GAP,
  HERO_CAROUSEL_PEEK,
  activeIndexFromOffset,
  carouselSlots,
  heroCarouselLayout,
  snapTarget,
  wrapOffset,
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

describe('activeIndexFromOffset (wrap-around)', () => {
  it('rounds the offset to the nearest card', () => {
    expect(activeIndexFromOffset(0, 300, 5)).toBe(0);
    expect(activeIndexFromOffset(149, 300, 5)).toBe(0);
    expect(activeIndexFromOffset(151, 300, 5)).toBe(1);
    expect(activeIndexFromOffset(600, 300, 5)).toBe(2);
  });

  it('wraps past the last card back to the first, and before the first to the last', () => {
    expect(activeIndexFromOffset(5 * 300, 300, 5)).toBe(0);
    expect(activeIndexFromOffset(17 * 300, 300, 5)).toBe(2);
    expect(activeIndexFromOffset(-300, 300, 5)).toBe(4);
  });

  it('returns 0 for an empty list', () => {
    expect(activeIndexFromOffset(300, 300, 0)).toBe(0);
  });
});

describe('wrapOffset', () => {
  it('leaves positions inside the half-range alone', () => {
    expect(wrapOffset(0, 900)).toBe(0);
    expect(wrapOffset(300, 900)).toBe(300);
    expect(wrapOffset(-300, 900)).toBe(-300);
  });

  it('brings a position beyond half the loop length around to the other side', () => {
    expect(wrapOffset(900, 900)).toBe(0);
    expect(wrapOffset(675, 900)).toBe(-225);
    expect(wrapOffset(-540, 900)).toBe(360);
  });
});

describe('carouselSlots', () => {
  it('renders every event once when there are at least three', () => {
    expect(carouselSlots(3)).toBe(3);
    expect(carouselSlots(5)).toBe(5);
  });

  it('doubles a two-event deck so both edges can tease the other card', () => {
    expect(carouselSlots(2)).toBe(4);
  });

  it('keeps one or none as is', () => {
    expect(carouselSlots(1)).toBe(1);
    expect(carouselSlots(0)).toBe(0);
  });
});

describe('snapTarget', () => {
  const INTERVAL = 300;

  it('settles on the nearest card when released without velocity', () => {
    expect(snapTarget(120, 0, INTERVAL, 0)).toBe(0);
    expect(snapTarget(180, 0, INTERVAL, 0)).toBe(300);
  });

  it('lets a flick carry a short drag to the next card', () => {
    expect(snapTarget(40, 1500, INTERVAL, 0)).toBe(300);
    expect(snapTarget(260, -1500, INTERVAL, 300)).toBe(0);
  });

  it('never moves more than one card per swipe', () => {
    expect(snapTarget(40, 20000, INTERVAL, 0)).toBe(300);
    expect(snapTarget(560, -20000, INTERVAL, 600)).toBe(300);
  });

  it('measures the one-card limit from where the drag started', () => {
    expect(snapTarget(1500 + 40, 9000, INTERVAL, 1500)).toBe(1800);
  });
});
