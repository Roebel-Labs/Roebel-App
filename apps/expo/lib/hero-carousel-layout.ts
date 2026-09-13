/** Width of the neighbouring card teased at each screen edge. */
export const HERO_CAROUSEL_PEEK = 20;
/** Horizontal gap between two hero cards. */
export const HERO_CAROUSEL_GAP = 10;
/** Fixed card height; the skeleton reserves the same box so nothing shifts. */
export const HERO_CAROUSEL_CARD_HEIGHT = 500;

export type HeroCarouselLayout = {
  screenWidth: number;
  cardWidth: number;
  /** Content padding on both sides: peek + gap, so the active card is centered. */
  sideInset: number;
  /** Snap distance: one card plus one gap. */
  interval: number;
  offsetForIndex: (index: number) => number;
};

/**
 * Geometry for a centered, snapping hero carousel where the previous and
 * next card peek in from the edges. Integer widths keep snap offsets exact.
 */
export function heroCarouselLayout(screenWidth: number): HeroCarouselLayout {
  const sideInset = HERO_CAROUSEL_PEEK + HERO_CAROUSEL_GAP;
  const cardWidth = Math.floor(screenWidth) - 2 * sideInset;
  const interval = cardWidth + HERO_CAROUSEL_GAP;
  return {
    screenWidth,
    cardWidth,
    sideInset,
    interval,
    offsetForIndex: (index) => index * interval,
  };
}

/**
 * Nearest card for a content offset, clamped to the list bounds.
 * Called from HeroCarousel's scroll worklet on the UI thread — the directive
 * is load-bearing: without it release builds crash with "Object is not a
 * function" the first time the carousel scrolls.
 */
export function activeIndexFromOffset(offsetX: number, interval: number, count: number): number {
  'worklet';
  if (count <= 0 || interval <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offsetX / interval)));
}
