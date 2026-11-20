// The moving metal sheen: one runtime shader shared by the card-wide shine and
// every layer with `shine: true`. Output is premultiplied white with a soft
// diagonal highlight band plus a thin, brighter glint trailing it.

export const SHINE_SKSL = `
uniform float phase;
uniform float2 tilt;
uniform float intensity;
uniform float2 size;

half4 main(float2 p) {
  float2 uv = p / size;
  float d = uv.x * 0.78 + uv.y * 0.62;
  float c = mix(-0.45, 1.85, phase) + tilt.x * 0.35 + tilt.y * 0.22;
  float u = (d - c) / 0.28;
  float v = (d - c - 0.18) / 0.045;
  float wide = exp(-u * u);
  float glint = exp(-v * v);
  float a = clamp((wide * 0.26 + glint * 0.16) * intensity, 0.0, 1.0);
  return half4(half(a), half(a), half(a), half(a));
}
`;

export const REDUCED_MOTION_PHASE = 0.35;

/** Uniforms for SHINE_SKSL in declaration order. */
export function shineUniforms(
  phase: number, tilt: { x: number; y: number } | undefined, intensity: number, w: number, h: number, reducedMotion?: boolean,
): number[] {
  const p = reducedMotion ? REDUCED_MOTION_PHASE : clamp01(phase);
  const t = reducedMotion || !tilt ? { x: 0, y: 0 } : { x: clampAbs1(tilt.x), y: clampAbs1(tilt.y) };
  return [p, t.x, t.y, clamp01(intensity), w, h];
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const clampAbs1 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0);
