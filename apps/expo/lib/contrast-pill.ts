import { glassBarFootprint, GLASS_PILL_TOP_GAP } from './glass-tab-geometry';

/** Height of the dark contrast pill ("Account wechseln", Erkunden Karte/Liste). */
export const CONTRAST_PILL_HEIGHT = 48;
/** Gap between the pill and the VISIBLE top edge of the glass bar (the footprint includes a transparent top gap). */
export const CONTRAST_PILL_GAP = 12;

/** Distance from the screen bottom to the pill's bottom edge. */
export function contrastPillBottom(insetBottom: number): number {
  return glassBarFootprint(insetBottom) - GLASS_PILL_TOP_GAP + CONTRAST_PILL_GAP;
}

/** Vertical gradient stops, light and dark mode (top → bottom). */
export const CONTRAST_PILL_GRADIENT = {
  light: ['#2E2E2E', '#161616'] as const,
  dark: ['#3A3A3A', '#1F1F1F'] as const,
};
