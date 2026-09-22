// Pure ratio classification against the DIN A portrait ratio.
import { A_SERIES_RATIO, RATIO_TOLERANCE } from "./constants";

export type RatioClass = "ok" | "landscape" | "square" | "too_short" | "too_tall";

export function classifyRatio(width: number, height: number): RatioClass {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`classifyRatio: invalid dimensions ${width}x${height}`);
  }
  const ratio = height / width;
  const deviation = ratio / A_SERIES_RATIO;
  if (deviation >= 1 - RATIO_TOLERANCE && deviation <= 1 + RATIO_TOLERANCE) return "ok";
  if (ratio < 1) return "landscape";
  if (ratio < 1.25) return "square";
  if (ratio < A_SERIES_RATIO) return "too_short";
  return "too_tall";
}

export const RATIO_LABELS: Record<RatioClass, string> = {
  ok: "A-Format",
  landscape: "Querformat",
  square: "Quadratisch",
  too_short: "Zu niedrig",
  too_tall: "Zu hoch",
};
