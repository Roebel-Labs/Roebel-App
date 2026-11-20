/**
 * Scroll-driven ranges for the collapsing hero detail layout.
 *
 * Everything hangs off ONE shared scroll offset (UI thread). The ranges:
 *
 *   0 ─────────────── collapseStart ──────── collapseEnd
 *   │  hero blur + color wash fade in (0 → collapseEnd)  │
 *   │                 │ buttons 20→16 inset, glass out,  │
 *   │                 │ app header + title fade in       │
 *
 * collapseEnd is the offset where the sheet's top edge (hero bottom minus the
 * sheet overlap) reaches the bottom of the app header, so the header is fully
 * opaque exactly when the content would slide under it — no jump.
 */

/** Bar height below the status bar. */
export const DETAIL_HEADER_BAR = 56;
/** Distance over which the header/buttons morph. */
const COLLAPSE_SPAN = 72;

export type CollapseRanges = {
  headerHeight: number;
  collapseStart: number;
  collapseEnd: number;
};

export function getCollapseRanges(heroHeight: number, sheetOverlap: number, topInset: number): CollapseRanges {
  const headerHeight = topInset + DETAIL_HEADER_BAR;
  const collapseEnd = Math.max(1, heroHeight - sheetOverlap - headerHeight);
  const collapseStart = Math.max(0, collapseEnd - COLLAPSE_SPAN);
  return { headerHeight, collapseStart, collapseEnd };
}
