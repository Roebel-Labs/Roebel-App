/** Width of the neighbouring card teased at each screen edge. */
export const HERO_CAROUSEL_PEEK = 12;
/** Horizontal gap between two hero cards. */
export const HERO_CAROUSEL_GAP = 8;
/** Fixed card height; the skeleton reserves the same box so nothing shifts. */
export const HERO_CAROUSEL_CARD_HEIGHT = 500;

// How far ahead a release velocity is projected when picking the snap
// target (seconds). Short on purpose: a flick advances one card, a lazy
// release settles on whichever card is nearer.
const VELOCITY_PROJECTION_S = 0.15;

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

// Every helper below runs inside reanimated worklets (scroll/gesture
// handlers, animated styles) — the 'worklet' directive is load-bearing:
// without it release builds crash with "Object is not a function".

/** Card index for a content offset, wrapping around the deck in both directions. */
export function activeIndexFromOffset(offsetX: number, interval: number, count: number): number {
  'worklet';
  if (count <= 0 || interval <= 0) return 0;
  const index = Math.round(offsetX / interval) % count;
  return index < 0 ? index + count : index;
}

/**
 * Wrap a slot's position relative to the viewport centre into one loop:
 * (-loopLength/2, loopLength/2]. A card that drifts past half the loop
 * reappears on the other side, which is what makes the deck endless.
 */
export function wrapOffset(relative: number, loopLength: number): number {
  'worklet';
  if (loopLength <= 0) return relative;
  return relative - loopLength * Math.round(relative / loopLength);
}

/**
 * Number of card views to mount. Three or more events loop as they are;
 * two are doubled so the card on either side of the centre is always the
 * other one; one (or none) cannot loop.
 */
export function carouselSlots(count: number): number {
  'worklet';
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 4;
  return count;
}

/**
 * Offset to settle on after a release: the nearest card to the projected
 * resting point, but never more than one card away from where the drag
 * started. `velocity` is the offset's velocity in px/s (finger velocity
 * negated, since dragging left advances the deck).
 */
export function snapTarget(
  offset: number,
  velocity: number,
  interval: number,
  startOffset: number
): number {
  'worklet';
  if (interval <= 0) return offset;
  const startIndex = Math.round(startOffset / interval);
  const projected = offset + velocity * VELOCITY_PROJECTION_S;
  const nearest = Math.round(projected / interval);
  const index = Math.max(startIndex - 1, Math.min(startIndex + 1, nearest));
  return index * interval;
}
