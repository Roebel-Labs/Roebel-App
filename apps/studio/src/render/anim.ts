import type { Easing, OverlayAnim, OverlayInstance } from '../state/types';

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** Maps linear progress 0..1 through an easing curve. Every curve maps 0→0 and 1→1; backOut overshoots in between. */
export function ease(e: Easing, t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  switch (e) {
    case 'linear':
      return x;
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'easeOut':
      return 1 - Math.pow(1 - x, 3);
    case 'backOut': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    default:
      return x;
  }
}

/**
 * Linear overlay progress: 0 = hidden … 1 = fully in. While visible it rises over `anim.durationMs`
 * after `changedAt` (+ `delayMs`); after a hide it falls back to 0. Pass `animIn` while visible,
 * `animOut` while hidden.
 */
export function overlayProgress(o: OverlayInstance, anim: OverlayAnim, nowMs: number, delayMs = 0): number {
  const target = o.visible ? 1 : 0;
  if (anim.kind === 'none' || !(anim.durationMs > 0)) return target;
  const p = clamp01((nowMs - o.changedAt - delayMs) / anim.durationMs);
  return o.visible ? p : 1 - p;
}

/** Linear scene-transition progress; `null` start (no transition running) means 1. */
export function transitionProgress(startedAt: number | null, durationMs: number, nowMs: number): number {
  if (startedAt === null || !(durationMs > 0)) return 1;
  return clamp01((nowMs - startedAt) / durationMs);
}
