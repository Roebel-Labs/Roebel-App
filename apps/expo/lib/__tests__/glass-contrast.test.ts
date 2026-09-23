import {
  contrastRatio,
  compositeOver,
  heroGlassSurfaceColor,
  HERO_GLASS_TINT,
  heroGlassTarget,
  WCAG_AA_NORMAL_TEXT,
  WCAG_AAA_NORMAL_TEXT,
  worstCaseAmbientBackdrop,
} from '@/lib/glass-contrast';
import { colors } from '@/constants/theme';
import { HERO_AMBIENT_MAX_OPACITY } from '@/lib/hero-carousel-layout';

const VARIANTS = ['light', 'dim', 'dark'] as const;

describe('contrast maths', () => {
  it('matches the WCAG reference ratios', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Mid grey on white, a published 4.6:1 pair.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('composites a translucent layer the way the renderer does', () => {
    expect(compositeOver('rgba(0,0,0,0.5)', '#ffffff')).toBe('#808080');
    expect(compositeOver('rgba(255,255,255,1)', '#000000')).toBe('#ffffff');
    expect(compositeOver('rgba(255,255,255,0)', '#123456')).toBe('#123456');
  });
});

describe('hero card glass stays readable over the ambient backdrop', () => {
  it.each(VARIANTS)('%s: title and meta text clear their target on the worst backdrop', (variant) => {
    const theme = colors[variant];
    // Worst case: the loudest possible poster pixel showing through the
    // ambient wash — white behind a dark theme, black behind the light one.
    const backdrop = worstCaseAmbientBackdrop(variant, HERO_AMBIENT_MAX_OPACITY);
    const surface = heroGlassSurfaceColor(variant, backdrop);
    const target = heroGlassTarget(variant);

    expect(contrastRatio(theme.textPrimary, surface)).toBeGreaterThanOrEqual(target);
    expect(contrastRatio(theme.textSecondary, surface)).toBeGreaterThanOrEqual(target);
  });

  it('holds the dark themes to the enhanced AAA target, light to AA', () => {
    // Max 2026-09-23: the dark cards read as too transparent at AA, so both
    // dark themes carry AAA. Light cannot: its grey meta text would need an
    // opaque panel (see the comment in glass-contrast.ts).
    expect(heroGlassTarget('dim')).toBe(WCAG_AAA_NORMAL_TEXT);
    expect(heroGlassTarget('dark')).toBe(WCAG_AAA_NORMAL_TEXT);
    expect(heroGlassTarget('light')).toBe(WCAG_AA_NORMAL_TEXT);
  });

  it('keeps every theme short of a fully opaque panel', () => {
    // Some of the wash must still show through, or the deck loses its glow.
    for (const variant of VARIANTS) {
      expect(HERO_GLASS_TINT[variant].alpha).toBeLessThanOrEqual(0.95);
    }
  });

  it('is stronger than the bottom navigation glass on every theme', () => {
    // GlassSurface's own wash tops out at 0.72 (light) / 0.45 (dim) / 0.62 (black).
    expect(HERO_GLASS_TINT.light.alpha).toBeGreaterThan(0.72);
    expect(HERO_GLASS_TINT.dim.alpha).toBeGreaterThan(0.45);
    expect(HERO_GLASS_TINT.dark.alpha).toBeGreaterThan(0.62);
  });
});
