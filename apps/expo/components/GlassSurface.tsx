import React, { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView, BlurTargetView } from 'expo-blur';
import { requireOptionalNativeModule } from 'expo';
import { useTheme } from '@/context/ThemeContext';

// Real frosted glass, not lowered opacity: a backdrop blur with the iOS
// "chrome" material tint (the material system bars use — heavily frosted
// yet ~80-90% opaque) and a light hairline edge where the glass meets the
// content. iOS blurs the layer beneath natively; Android (SDK 55+ stable
// blur) samples a BlurTargetView that must wrap the scrolling content —
// see <GlassBackdrop>. Android < 12 gracefully degrades to the tinted
// semi-transparent fill inside expo-blur itself.

// An EAS Update could ship this JS into a binary built without the
// expo-blur native module — same guard pattern as PagerView in FeedHome.
const BLUR_AVAILABLE = (() => {
  try {
    return requireOptionalNativeModule('ExpoBlur') != null;
  } catch {
    return false;
  }
})();

const GlassTargetContext = createContext<RefObject<View | null> | null>(null);

/**
 * Provides the shared blur-target ref for one screen. MUST wrap BOTH the
 * <GlassBackdrop> and every <GlassSurface> bar: the bars deliberately sit
 * OUTSIDE the backdrop in JSX, so a provider inside GlassBackdrop could
 * never reach them — which left Android bars with a null target, silently
 * falling back to the tinted fill (2026-08-29 bug: "still no frosted
 * glass"). One provider per screen; screens kept mounted by the router each
 * get their own.
 */
export function GlassProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<View>(null);
  return <GlassTargetContext.Provider value={ref}>{children}</GlassTargetContext.Provider>;
}

/**
 * Wraps the scrollable content that glass chrome floats over. On Android
 * this is the surface the frost samples its pixels from; on iOS and web
 * it's a plain View passthrough. Every screen using <GlassSurface /> must
 * render its content inside one of these — and the glass bars OUTSIDE it,
 * after it in JSX order, with a <GlassProvider> around both.
 */
export function GlassBackdrop({ children, style, ...rest }: ViewProps) {
  const ownRef = useRef<View>(null);
  const shared = useContext(GlassTargetContext);
  const ref = shared ?? ownRef;
  // Native only (web has no BlurTargetView). Android history on this
  // hardware (Pixel 7): 08-23 crash with SurfaceView videos in the target
  // (expo/expo#24572, fixed via TextureView); 08-29 invisible content when
  // FIVE GlassSurface bars sampled one target — while the 08-28 diagnostic
  // (ONE sampler, one target) composited fine. Working rule: a target may
  // be sampled by AT MOST ONE BlurView per screen — the bottom nav, via
  // GlassSurface's androidExperimentalBlur flag. All other bars stay on the
  // tinted fill on Android.
  if (Platform.OS === 'web' || !BLUR_AVAILABLE) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <BlurTargetView ref={ref} style={style} {...rest}>
      {children}
    </BlurTargetView>
  );
}

/** The light rim where a glass edge catches light — also usable as a borderColor. */
export function glassEdgeColor(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.09)';
}

type Props = {
  /** Blur strength 1-100. 100 = the authentic system material. */
  intensity?: number;
  /** Which edge of the bar meets the content — draws the light hairline there. */
  edge?: 'top' | 'bottom' | 'none';
  /**
   * Android real backdrop blur for THIS surface. At most ONE surface per
   * screen may set it (see the GlassBackdrop comment — multiple samplers on
   * one target ate the screen content on device). Used by the bottom nav.
   */
  androidExperimentalBlur?: boolean;
};

/**
 * Absolute-fill frosted-glass background. Render as the FIRST child of a
 * bar/pill (siblings paint above it); the container itself must stay
 * transparent and, for rounded shapes, clip with overflow:'hidden'.
 */
export default function GlassSurface({ intensity = 100, edge = 'none', androidExperimentalBlur = false }: Props) {
  const { colors, isDark } = useTheme();
  const target = useContext(GlassTargetContext);

  // RACE GUARD (Android): expo-blur's BlurView reads `blurTarget.current`
  // exactly once in componentDidMount and only re-checks on a re-render —
  // a ref filling in later never triggers one, so an empty ref at mount
  // means the native side silently stays on its near-opaque NONE fallback
  // forever (the "solid gray bar" symptom). Mount the BlurView only after
  // the target ref is confirmed attached.
  const [targetReady, setTargetReady] = useState(false);
  useEffect(() => {
    if (target?.current) setTargetReady(true);
  }, [target]);

  const edgeLine =
    edge === 'none' ? null : (
      <View
        pointerEvents="none"
        style={[
          styles.edge,
          edge === 'top' ? styles.edgeTop : styles.edgeBottom,
          { backgroundColor: glassEdgeColor(isDark) },
        ]}
      />
    );

  // iOS: authentic chrome material. Android: full blur radius but a LIGHTER
  // overlay — the tint's base alpha is the knob that's independent of radius
  // (chrome material = 75% overlay at intensity 100; 'default' = 44% white,
  // ultraThinDark = 55% dark). Max's call 2026-08-29: strong blur, light frost.
  const tint =
    Platform.OS === 'android'
      ? isDark
        ? 'systemUltraThinMaterialDark'
        : 'default'
      : isDark
        ? 'systemChromeMaterialDark'
        : 'systemChromeMaterial';

  // iOS always; Android only for the single opted-in surface per screen
  // (bottom nav) with a mounted target — see the GlassBackdrop comment.
  if (
    BLUR_AVAILABLE &&
    (Platform.OS === 'ios' ||
      (Platform.OS === 'android' && androidExperimentalBlur && targetReady))
  ) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={intensity}
          tint={tint}
          // Android-only props; ignored on iOS. Blurs the GlassBackdrop
          // beneath via RenderNode on Android 12+, tinted fill below that.
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={target ?? undefined}
        />
        {Platform.OS === 'android' && (
          // Brightening wash over the blur — expo-blur's tint table reads
          // dark on device; this is our own knob, independent of radius
          // (Max 2026-08-29: "much lighter"). Dark mode gets a soft
          // surface-colored wash instead.
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? 'rgba(24, 25, 27, 0.45)'
                  : 'rgba(255, 255, 255, 0.55)',
              },
            ]}
          />
        )}
        {edgeLine}
      </View>
    );
  }

  // No native blur available (old binary, web, Android outside a
  // GlassBackdrop): translucent solid keeps the chrome legible.
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: hexToRgba(colors.background, 0.96) },
        ]}
      />
      {edgeLine}
    </View>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  edgeTop: {
    top: 0,
  },
  edgeBottom: {
    bottom: 0,
  },
});
