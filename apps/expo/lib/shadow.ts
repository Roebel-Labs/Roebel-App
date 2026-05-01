import type { ViewStyle } from 'react-native';

// Soft, iOS-style elevation using RN >=0.76 boxShadow.
// Renders identically on iOS and Android (blurred, soft drop shadow)
// — replaces the old Platform.select({ ios: shadow*, android: { elevation } }) pattern
// which produced a flat Material halo on Android.
export function softShadow(level: 1 | 2 | 3 = 2, isDark = false): ViewStyle {
  const base = isDark ? 0.35 : 0.1;
  const presets: Record<1 | 2 | 3, string> = {
    1: `0px 1px 4px rgba(0,0,0,${(base * 0.6).toFixed(3)})`,
    2: `0px 4px 12px rgba(0,0,0,${base.toFixed(3)})`,
    3: `0px 8px 24px rgba(0,0,0,${(base * 1.2).toFixed(3)})`,
  };
  return { boxShadow: presets[level] } as ViewStyle;
}
