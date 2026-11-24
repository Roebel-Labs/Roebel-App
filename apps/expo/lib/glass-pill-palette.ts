import type { ThemeVariant } from '@/constants/theme';

/** Colors of the floating glass bottom-nav pill — shared by the bar and the pills above it. */
export type GlassPillPalette = {
  active: string;
  inactive: string;
  highlight: string;
  rim: string;
  liquidTint: string;
  wash: string;
  shadow: string;
  /** Solid stand-in for the pill color (avatar rings, fallbacks). */
  solid: string;
};

export function glassPillPalette(isDark: boolean, variant: ThemeVariant): GlassPillPalette {
  return isDark
    ? {
        active: '#FFFFFF',
        // Opaque: a translucent tint double-paints where icon strokes overlap (lighter joints).
        inactive: '#9C9CA3',
        highlight: 'rgba(255,255,255,0.16)',
        rim: 'rgba(255,255,255,0.14)',
        liquidTint: variant === 'dark' ? 'rgba(20,20,22,0.55)' : 'rgba(40,41,44,0.5)',
        wash: variant === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(24,25,27,0.2)',
        shadow: '0px 10px 30px rgba(0,0,0,0.55)',
        solid: variant === 'dark' ? '#1C1C1E' : '#2A2B2E',
      }
    : {
        active: '#000000',
        inactive: '#6E7079',
        highlight: 'rgba(118,118,128,0.14)',
        rim: 'rgba(255,255,255,0.9)',
        liquidTint: 'rgba(255,255,255,0.6)',
        wash: 'rgba(255,255,255,0.45)',
        shadow: '0px 10px 30px rgba(0,0,0,0.12)',
        solid: '#F4F4F5',
      };
}
