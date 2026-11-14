import { useEffect, useState, type ComponentType } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { GlassViewProps } from 'expo-glass-effect';

/**
 * Liquid Glass (iOS 26+) for our own floating controls — the same material
 * the system uses for its tab bar and toolbar buttons.
 *
 * expo-glass-effect is compiled into the app as a dependency of expo-router,
 * but its JS resolves the native view at import time and throws where the
 * module is missing. So it is only required after the native module has been
 * found, and every caller falls back to the frosted blur (GlassSurface)
 * when this is null: Android, web, iOS below 26, or an older binary.
 */
const NativeGlassView: ComponentType<GlassViewProps> | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    if (requireOptionalNativeModule('ExpoGlassEffect') == null) return null;
    const glass = require('expo-glass-effect') as typeof import('expo-glass-effect');
    // isGlassEffectAPIAvailable guards the early iOS 26 builds that have the
    // design but crash on the API.
    if (!glass.isLiquidGlassAvailable() || !glass.isGlassEffectAPIAvailable()) return null;
    return glass.GlassView;
  } catch {
    return null;
  }
})();

export const LiquidGlassView = NativeGlassView;

/**
 * True when our controls should render Liquid Glass right now: the device
 * supports it AND the user has not turned on "Reduce Transparency"
 * (Settings → Accessibility), which is the system's own signal to use solid,
 * more legible surfaces instead.
 */
export function useLiquidGlass(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    if (!NativeGlassView) return undefined;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((on) => {
        if (alive) setReduceTransparency(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return NativeGlassView != null && !reduceTransparency;
}
