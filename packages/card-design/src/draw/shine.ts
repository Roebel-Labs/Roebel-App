// Holographic foil (Max 2026-11-20: "a reflecting hologram, not a lens flare,
// not just moving linearly left to right"). One runtime shader shared by the
// card-wide shine and every layer with `shine: true`:
//   - rainbow interference bands whose position AND angle follow both tilt axes,
//   - a fine diffraction micro-texture that shimmers as the phone moves,
//   - strongest where the light hits (soft spot moving opposite the tilt),
//   - a small specular glint and a faint rim; nearly invisible at rest.
// Output is premultiplied (colour * alpha), drawn src-over on the card.

export const SHINE_SKSL = `
uniform float phase;
uniform float2 tilt;
uniform float intensity;
uniform float2 size;

float3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + float3(0.0, 0.33, 0.67)));
}

half4 main(float2 p) {
  float2 uv = p / size;
  float aspect = size.x / size.y;
  float2 q = float2(uv.x * aspect, uv.y);

  float2 light = float2(0.5 - tilt.x * 0.55, 0.45 - tilt.y * 0.6);
  float2 dl = (uv - light) * float2(aspect, 1.0);
  float r2 = dot(dl, dl);
  float spot = exp(-r2 / 0.30);

  float ang = 0.9 + tilt.x * 0.3 - tilt.y * 0.2;
  float2 dir = float2(cos(ang), sin(ang));
  float t = dot(q, dir) * 1.6 + tilt.x * 0.9 - tilt.y * 0.8 + phase * 0.5;
  float micro = sin(q.x * 38.0 + q.y * 22.0 + tilt.y * 6.0 + tilt.x * 4.0) * 0.5 + 0.5;
  float3 holo = spectrum(t + micro * 0.08);
  float sheen = 0.55 + 0.45 * sin(t * 9.42477);

  float tiltAmount = clamp(length(tilt) * 1.4, 0.0, 1.0);
  float a = (0.10 + 0.24 * spot) * (0.6 + 0.4 * sheen) * (0.4 + 0.6 * tiltAmount);
  float glint = exp(-r2 / 0.006);
  float2 e = min(uv, 1.0 - uv);
  float rim = 1.0 - smoothstep(0.0, 0.06, min(e.x * aspect, e.y));
  a = a + glint * 0.06 + rim * 0.05 * tiltAmount;
  a = clamp(a * intensity, 0.0, 0.75);
  float3 col = mix(holo, float3(1.0), glint * 0.7);
  return half4(half3(col * a), half(a));
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
