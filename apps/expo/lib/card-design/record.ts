// Records a card design into an SkPicture (drawn by <Picture> in a Skia <Canvas>). Pure over the
// Skia object passed in, so tests run it against RN Skia's headless implementation.
import { drawDesign, drawHeight, type CardDesign, type DrawOptions, type SkiaApi } from '@roebel/card-design';

export interface PictureSkiaLike {
  XYWHRect(x: number, y: number, w: number, h: number): object;
  PictureRecorder(): { beginRecording(bounds?: object): unknown; finishRecordingAsPicture(): unknown };
}

/** The picture of `design` at `opts.width`, or null if Skia failed (the caller shows a placeholder). */
export function recordDesign<P = unknown>(Skia: PictureSkiaLike, api: SkiaApi, design: CardDesign, opts: DrawOptions): P | null {
  try {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, opts.width, drawHeight(design, opts.width)));
    drawDesign(api, api.wrapCanvas(canvas), design, opts);
    return recorder.finishRecordingAsPicture() as P;
  } catch {
    return null;
  }
}

export type Tilt = { x: number; y: number };

/** Radians of tilt that count as "full" (-1..1). */
const FULL_TILT = 0.5;
/** Exponential smoothing per sample (60 Hz): higher follows faster. */
export const TILT_SMOOTHING = 0.14;

const clamp1 = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/**
 * Next smoothed tilt from a DeviceMotion rotation sample (beta = front/back, gamma = left/right,
 * radians). `baseline` is the beta the phone was held at when the card appeared, so holding the
 * phone at any angle starts with a centred sheen.
 */
export function nextTilt(prev: Tilt, rotation: { beta: number; gamma: number }, baseline: number, k = TILT_SMOOTHING): Tilt {
  const target = { x: clamp1(rotation.gamma / FULL_TILT), y: clamp1((rotation.beta - baseline) / FULL_TILT) };
  return { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
}

/** The sheen's resting phase; tilting sweeps it across the card. */
export const REST_PHASE = 0.35;

export function phaseForTilt(t: Tilt): number {
  return Math.max(0, Math.min(1, REST_PHASE + t.x * 0.3 + t.y * 0.2));
}

/** Tilt steps that are redrawn (1/100 of full tilt): fine enough that the light glides, not steps. */
export const TILT_STEP = 0.01;

export function quantiseTilt(t: Tilt, step = TILT_STEP): Tilt {
  return { x: Math.round(t.x / step) * step, y: Math.round(t.y / step) * step };
}

export function sameTilt(a: Tilt, b: Tilt): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

/** Whether a tilt change is big enough to redraw (saves frames while the phone lies still). */
export function tiltMoved(a: Tilt, b: Tilt, eps = 0.004): boolean {
  return Math.abs(a.x - b.x) > eps || Math.abs(a.y - b.y) > eps;
}
