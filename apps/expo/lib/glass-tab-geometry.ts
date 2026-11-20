/**
 * Geometry of the glass pill bottom navigation (components/navigation/GlassTabBar).
 * Pure so the highlight math and the footprint budget are unit-tested.
 */

/** Height of the floating pill itself. */
export const GLASS_PILL_HEIGHT = 68;
/** Rim width; the rim sits inside the pill box. */
export const GLASS_PILL_BORDER = 1;
/** Gap between the rim and the active-tab highlight (inside the border). */
export const GLASS_PILL_INSET = 4;
/** Distance between the pill and the left/right screen edges. */
export const GLASS_PILL_SIDE_MARGIN = 20;
/** Space above the pill inside the host's bottom overlay. */
export const GLASS_PILL_TOP_GAP = 4;
/** Smallest gap under the pill on devices without a home indicator. */
export const GLASS_PILL_MIN_BOTTOM_GAP = 12;
/** Clearance above the system gesture bar / home indicator. */
export const GLASS_PILL_SAFE_GAP = 6;

export const GLASS_HIGHLIGHT_HEIGHT = GLASS_PILL_HEIGHT - GLASS_PILL_BORDER * 2 - GLASS_PILL_INSET * 2;

/**
 * Gap under the pill. The pill sits fully ABOVE the safe area (gesture bar /
 * home indicator) with a little clearance — tucking it into the inset made
 * it crowd the system bar (Max 2026-11-20: "move it up more").
 */
export function glassPillBottomGap(insetBottom: number): number {
  return Math.max(insetBottom + GLASS_PILL_SAFE_GAP, GLASS_PILL_MIN_BOTTOM_GAP);
}

/** Total height the glass bar takes from the bottom of the screen. */
export function glassBarFootprint(insetBottom: number): number {
  return GLASS_PILL_TOP_GAP + GLASS_PILL_HEIGHT + glassPillBottomGap(insetBottom);
}

/** Width of one tab slot; `pillWidth` is the content width inside the rim. */
export function glassTabWidth(pillWidth: number, tabCount: number): number {
  if (tabCount <= 0 || pillWidth <= 0) return 0;
  return Math.max(0, (pillWidth - GLASS_PILL_INSET * 2) / tabCount);
}

/** Left offset (inside the rim) of the highlight for the tab at `index`, clamped. */
export function glassHighlightX(pillWidth: number, tabCount: number, index: number): number {
  if (tabCount <= 0) return GLASS_PILL_INSET;
  const clamped = Math.min(Math.max(index, 0), tabCount - 1);
  return GLASS_PILL_INSET + clamped * glassTabWidth(pillWidth, tabCount);
}

/** Content width inside the rim, derived from the window (no layout pass needed). */
export function glassPillInnerWidth(windowWidth: number): number {
  return Math.max(0, windowWidth - GLASS_PILL_SIDE_MARGIN * 2 - GLASS_PILL_BORDER * 2);
}
