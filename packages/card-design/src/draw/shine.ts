// The card's reflection: one runtime shader shared by the card-wide shine and
// every layer with `shine: true`. Reads as real light on a laminated card
// rather than a white stripe (Max 2026-11-20):
//   - a soft specular hotspot that moves OPPOSITE the tilt, like a reflection
//     of a light above the phone (broad glow + hot core),
//   - a wide, soft diagonal sweep with a faint trailing glint,
//   - a pastel thin-film tint that shifts with the viewing angle,
//   - a fresnel brightening along the rim that grows with the tilt.
// Output is premultiplied (colour * alpha), drawn src-over on the card.

export const SHINE_SKSL = `
uniform float phase;
uniform float2 tilt;
uniform float intensity;
uniform float2 size;

float3 filmTint(float t) {
  float3 c = 0.5 + 0.5 * cos(6.28318 * (t + float3(0.0, 0.33, 0.67)));
  return mix(float3(1.0), c, 0.2);
}

half4 main(float2 p) {
  float2 uv = p / size;
  float aspect = size.x / size.y;

  float2 light = float2(0.5 - tilt.x * 0.6, 0.3 - tilt.y * 0.55);
  float2 q = (uv - light) * float2(aspect, 1.0);
  float r2 = dot(q, q);
  float glow = exp(-r2 / 0.20);
  float core = exp(-r2 / 0.022);

  float d = uv.x * 0.78 + uv.y * 0.62;
  float c = mix(-0.45, 1.85, phase) + tilt.x * 0.35 + tilt.y * 0.22;
  float u = (d - c) / 0.36;
  float band = exp(-u * u);
  float v = (d - c - 0.17) / 0.07;
  float glint = exp(-v * v);

  float2 e = min(uv, 1.0 - uv);
  float edgeDist = min(e.x * aspect, e.y);
  float rim = 1.0 - smoothstep(0.0, 0.07, edgeDist);
  float tiltAmount = clamp(length(tilt), 0.0, 1.0);

  float a = glow * 0.12 + core * 0.15 + band * 0.17 + glint * 0.08 + rim * 0.06 * (0.35 + tiltAmount);
  a = clamp(a * intensity, 0.0, 0.8);
  float3 col = filmTint(d * 1.1 - c * 0.7 + tilt.x * 0.25 + tilt.y * 0.15);
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
