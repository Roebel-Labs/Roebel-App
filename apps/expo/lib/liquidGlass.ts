import { useEffect, useState, type ComponentType } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { GlassViewProps } from 'expo-glass-effect';

/**
 * Liquid Glass (iOS 26+) for our own floating controls — the material the
 * system uses for its tab bar.
 *
 * expo-glass-effect's JS resolves the native view at import time and throws
 * where the module is missing, so it is only required after the native module
 * has been found. Every caller falls back to the frosted blur (GlassSurface)
 * when this is null: Android, web, iOS below 26, or an older binary.
 */
const NativeGlassView: ComponentType<GlassViewProps> | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    if (requireOptionalNativeModule('ExpoGlassEffect') == null) return null;
    const glass = require('expo-glass-effect') as typeof import('expo-glass-effect');
    // isGlassEffectAPIAvailable guards early iOS 26 betas that have the
    // design but crash on the API.
    if (!glass.isLiquidGlassAvailable() || !glass.isGlassEffectAPIAvailable()) return null;
    return glass.GlassView;
  } catch {
    return null;
  }
})();

export const LiquidGlassView = NativeGlassView;

/**
 * True when Liquid Glass should render right now: the device supports it AND
 * "Reduce Transparency" is off (the system's signal for solid surfaces).
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
