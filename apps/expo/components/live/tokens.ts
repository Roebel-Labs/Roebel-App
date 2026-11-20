// Live room palette. Everything outside the video follows the app theme (light / dim / dark);
// the video area itself stays black in every theme (like YouTube), so the on-video chrome uses VIDEO.
import { useMemo } from 'react';
import { fontFamily, type ThemeVariant } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export type LivePalette = {
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Brand navy (filled buttons, support cards); text on it is always `onNavy`. */
  navy: string;
  navyBright: string;
  onNavy: string;
  /** Tinted navy surface (on-stage row, selected vote). */
  navySoft: string;
  navySoftBorder: string;
  /** Kicker / highlight text and icons. */
  accent: string;
  /** LIVE pill + JETZT tag (brand fixed). */
  red: string;
  /** Unterstützen gold: a FILL colour, text on it is always '#1B1B1B'. */
  gold: string;
  /** Gold as TEXT / icon colour on the theme background (darker on light for contrast). */
  goldText: string;
  goldSoft: string;
  goldBorder: string;
  /** Soft blue tint for system rows. */
  infoSoft: string;
  errorSoft: string;
  errorText: string;
  /** Bar track + fill in the vote results. */
  barTrack: string;
  barFill: string;
  /** Chat name colours (readable on `bg`). */
  nameColors: readonly string[];
  scrim: string;
};

/** Fixed dark palette: the video area, the pre-show / end cards on the video and the full-screen guest camera. */
export const VIDEO = {
  bg: '#18191B',
  surface: '#202226',
  surfaceRaised: '#2A2C31',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.66)',
  textTertiary: 'rgba(255,255,255,0.42)',
  navy: '#00498B',
  navyBright: '#1E6BB8',
  accent: '#7ABBF2',
  red: '#E5484D',
  gold: '#F2C14E',
  goldSoft: 'rgba(242,193,78,0.14)',
  scrim: 'rgba(0,0,0,0.55)',
} as const;

const NAME_COLORS_DARK = ['#7ABBF2', '#F2C14E', '#8BD3A6', '#F29E7A', '#C3A6F2', '#F27AB0', '#7AE0F2'] as const;
const NAME_COLORS_LIGHT = ['#00498B', '#8A5A00', '#1F7A45', '#B4461F', '#6B45B8', '#B8246A', '#00727F'] as const;

function buildPalette(variant: ThemeVariant, c: ReturnType<typeof useTheme>['colors']): LivePalette {
  const light = variant === 'light';
  const shared = {
    navy: '#00498B',
    navyBright: '#1E6BB8',
    onNavy: '#FFFFFF',
    gold: '#F2C14E',
    scrim: 'rgba(0,0,0,0.55)',
  };
  if (light) {
    return {
      ...shared,
      isDark: false,
      bg: c.background,
      surface: c.surface,
      surfaceRaised: '#ECEDEF',
      border: c.border,
      borderStrong: '#D1D5DB',
      text: c.textPrimary,
      textSecondary: c.textSecondary,
      textTertiary: c.textTertiary,
      navySoft: 'rgba(0,73,139,0.07)',
      navySoftBorder: 'rgba(0,73,139,0.28)',
      accent: c.primary,
      red: '#DC2626',
      goldText: '#8A5A00',
      goldSoft: 'rgba(242,193,78,0.22)',
      goldBorder: 'rgba(196,140,20,0.45)',
      infoSoft: 'rgba(0,73,139,0.06)',
      errorSoft: c.errorBackground,
      errorText: '#B91C1C',
      barTrack: 'rgba(0,0,0,0.07)',
      barFill: 'rgba(0,0,0,0.28)',
      nameColors: NAME_COLORS_LIGHT,
    };
  }
  // dim (#18191B) and dark (#000): the original live palette, anchored on the theme's own background.
  return {
    ...shared,
    isDark: true,
    bg: c.background,
    surface: variant === 'dim' ? '#202226' : c.surface,
    surfaceRaised: variant === 'dim' ? '#2A2C31' : '#2A2D32',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
    text: c.textPrimary,
    textSecondary: c.textSecondary,
    textTertiary: c.textTertiary,
    navySoft: 'rgba(0,73,139,0.42)',
    navySoftBorder: 'rgba(122,187,242,0.35)',
    accent: '#7ABBF2',
    red: '#E5484D',
    goldText: '#F2C14E',
    goldSoft: 'rgba(242,193,78,0.14)',
    goldBorder: 'rgba(242,193,78,0.4)',
    infoSoft: 'rgba(122,187,242,0.08)',
    errorSoft: 'rgba(229,72,77,0.16)',
    errorText: '#FFD0D0',
    barTrack: 'rgba(255,255,255,0.08)',
    barFill: 'rgba(255,255,255,0.45)',
    nameColors: NAME_COLORS_DARK,
  };
}

// The theme's colour objects are module constants, so one palette per theme is shared app-wide
// (stable identity → the style cache below hits across every row and sheet).
const paletteCache = new WeakMap<object, LivePalette>();

/** Live palette for the current app theme (same object for every caller while the theme is unchanged). */
export function useLivePalette(): LivePalette {
  const { variant, colors } = useTheme();
  return useMemo(() => {
    const hit = paletteCache.get(colors);
    if (hit) return hit;
    const p = buildPalette(variant, colors);
    paletteCache.set(colors, p);
    return p;
  }, [variant, colors]);
}

const styleCache = new WeakMap<(L: LivePalette) => unknown, WeakMap<LivePalette, unknown>>();

/** Builds a component's themed StyleSheet once per palette (cheap for chat rows rendered by the hundred). */
export function liveStyles<T>(factory: (L: LivePalette) => T, L: LivePalette): T {
  let byPalette = styleCache.get(factory);
  if (!byPalette) {
    byPalette = new WeakMap();
    styleCache.set(factory, byPalette);
  }
  let styles = byPalette.get(L) as T | undefined;
  if (!styles) {
    styles = factory(L);
    byPalette.set(L, styles);
  }
  return styles;
}

export const F = fontFamily;
