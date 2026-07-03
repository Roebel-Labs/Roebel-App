// Chart palette — single source of truth for the Economy tab.
//
// Four on-brand ramps (ink, navy, sky, gold) supplied by the Röbel brand. Every
// chart reads its colours from here, so re-skinning the whole tab is a one-file
// change. Navy is the primary accent; sky is the secondary series; gold is the
// highlight / attention colour; ink + grays are structure and neutrals.
import type { FlowKind } from "./circlesData";

/** Graded ramps — index by weight. Use tints for multi-series legibility. */
export const RAMP = {
  ink: { 900: "#051433", gray: "#6B7280", grayLt: "#B4B8C1", muted: "#F0F0F0", white: "#FFFFFF" },
  navy: { 700: "#00498B", 400: "#679AC8", 100: "#E5ECF3" },
  sky: { 500: "#7ABBF2", 300: "#BCDDF9", 100: "#E4F2FF" },
  gold: { 500: "#FDC705", 300: "#FEE382", 100: "#FFF4CD" },
} as const;

/** Flat, convenient brand tokens. */
export const C = {
  ink: "#051433",
  navy: "#00498B",
  navyMid: "#679AC8",
  navyPale: "#E5ECF3",
  sky: "#7ABBF2",
  skyLt: "#BCDDF9",
  skyPale: "#E4F2FF",
  gold: "#FDC705",
  goldLt: "#FEE382",
  goldPale: "#FFF4CD",
  gray: "#6B7280",
  grayLt: "#B4B8C1",
  grid: "#E5E7EB", // hairline gridlines (border token)
  axis: "#9CA3AF", // axis tick labels
  muted: "#F0F0F0",
  white: "#FFFFFF",
} as const;

/** Flow kind → colour. Navy mint headline, sky reward, gold spend, gray peer. */
export const FLOW_COLOR: Record<FlowKind, string> = {
  mint: C.navy,
  reward: C.sky,
  spend: C.gold,
  transfer: C.grayLt,
};

/** Ordered palette for ad-hoc multi-series charts (most→least emphasis). */
export const SERIES_PALETTE = [C.navy, C.sky, C.gold, C.navyMid, C.gray, C.grayLt] as const;

/** Gradient stop opacities for area fills (top → bottom). */
export const AREA_FILL = { top: 0.28, bottom: 0.02 } as const;
