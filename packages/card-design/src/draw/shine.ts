// Holographic foil (Max 2026-11-20: "a reflecting hologram, not a lens flare, not just moving
// linearly left to right"; 2026-11-21: "professional card tilt + chromatic holo reflection").
// One runtime shader shared by the card-wide foil and every layer with `shine: true`, built the way
// the reference holo work does it (pokemon-cards-css, Compose AGSL foil):
//   - THIN-FILM INTERFERENCE colour: per RGB wavelength, cos(2π · 2nd·cosθ / λ) — the physical
//     reason foil shifts hue with the viewing angle, softer and more "real" than a cosine rainbow,
//   - film thickness = slow organic noise + diagonal diffraction bands that slide AND rotate with
//     both tilt axes, plus the view angle (centre vs. edge of the card),
//   - a broad glare whose light source moves OPPOSITE the tilt (a fixed lamp over a tilting card),
//     its centre washed towards white light — soft, never a lens dot (Max: "no lens dots"),
//   - a Fresnel term: edges and steep tilts catch more light, plus a faint rim,
//   - a fine brushed micro-texture that shimmers with motion (no glitter points),
//   - nearly invisible at rest; pearly rather than a saturated rainbow (Max 2026-11-21).
// Output is premultiplied (colour * alpha), drawn src-over (screen/dodge would vanish on the light
// silver/paper presets).

export const SHINE_SKSL = `
uniform float phase;
uniform float2 tilt;
uniform float intensity;
uniform float2 size;

float3 thinFilm(float d, float cosT) {
  float3 lambda = float3(650.0, 532.0, 450.0);
  float3 ph = 6.28318 * (2.0 * 1.33 * d * cosT) / lambda;
  return 0.5 + 0.5 * cos(ph);
}

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

half4 main(float2 p) {
  float2 uv = p / size;
  float aspect = size.x / size.y;
  float2 q = float2(uv.x * aspect, uv.y);
  float tiltAmount = clamp(length(tilt) * 1.4, 0.0, 1.0);

  float2 light = float2(0.5 - tilt.x * 0.6, 0.42 - tilt.y * 0.65);
  float2 dl = (uv - light) * float2(aspect, 1.0);
  float r2 = dot(dl, dl);
  float glare = exp(-r2 / 0.22);
  float core = exp(-r2 / 0.05) * 0.5;

  float2 view = (uv - 0.5) * 0.6 + tilt * 0.4;
  float cosT = sqrt(1.0 - min(dot(view, view), 1.0) * 0.8);

  float ang = 0.85 + tilt.x * 0.25 - tilt.y * 0.18;
  float2 dir = float2(cos(ang), sin(ang));
  float band = dot(q, dir);
  float d = 380.0 + 160.0 * noise(q * 2.2 + tilt * 0.8) + 220.0 * band
    + 260.0 * (tilt.x * 0.8 - tilt.y * 0.7) + phase * 120.0;
  float3 col = mix(float3(1.0), thinFilm(d, cosT), 0.78);

  float micro = 0.5 + 0.5 * sin(q.x * 46.0 + q.y * 27.0 + tilt.y * 7.0 + tilt.x * 5.0 + noise(q * 18.0) * 3.0);
  float sweep = 0.5 + 0.5 * sin(band * 9.0 - (tilt.x - tilt.y) * 4.0 + phase * 3.14159);

  float fres = (1.0 - cosT) * (1.0 - cosT);
  float2 e = min(uv, 1.0 - uv);
  float rim = 1.0 - smoothstep(0.0, 0.05, min(e.x * aspect, e.y));

  float a = (0.10 + 0.32 * glare + 0.12 * core) * (0.65 + 0.35 * sweep) * (0.85 + 0.15 * micro);
  a = a * (0.35 + 0.65 * tiltAmount);
  a = a + (fres * 0.6 + rim * 0.06) * tiltAmount;
  a = clamp(a * intensity, 0.0, 0.7);
  col = mix(col, float3(1.0), clamp(core * 0.8, 0.0, 0.6));
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
