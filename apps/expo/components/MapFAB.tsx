import React from 'react';
import { Pressable, Text, StyleSheet, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import ReanimatedAnimated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { GlassFill, glassChrome } from '@/components/GlassIconButton';
import { LocationIcon } from '@/components/Icons';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';

type Props = {
  /**
   * Reanimated shared value driving show/hide-on-scroll (true = visible).
   * Pass a shared value written from a `useAnimatedScrollHandler` so
   * show/hide runs entirely on the UI thread with zero JS re-renders.
   * Defaults to always-visible when omitted.
   */
  visible?: SharedValue<boolean>;
  label?: string;
  href?: string;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  /** Extra lift, e.g. to clear the Hören mini player. */
  bottomOffset?: number;
};

export default function MapFAB({
  visible,
  label = 'Karte',
  href = '/location',
  icon,
  accessibilityLabel,
  bottomOffset = 0,
}: Props) {
  const router = useRouter();
  const { colors, isDark, variant } = useTheme();
  const { rim, shadow } = glassChrome(isDark);
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // Fallback for callers that don't drive show/hide — created unconditionally
  // to satisfy the rules of hooks, only actually used when `visible` is omitted.
  const alwaysVisible = useSharedValue(true);
  const visibleShared = visible ?? alwaysVisible;

  const fabTranslateY = useDerivedValue(() =>
    withTiming(visibleShared.value ? 0 : 80, {
      duration: 400,
      easing: visibleShared.value ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    })
  );
  const fabOpacity = useDerivedValue(() =>
    withTiming(visibleShared.value ? 1 : 0, {
      duration: 350,
      easing: visibleShared.value ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    })
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fabTranslateY.value }],
    opacity: fabOpacity.value,
    pointerEvents: visibleShared.value ? 'auto' : 'none',
  }));

  // One ease-out each way — no spring overshoot.
  const handlePressIn = () => {
    scale.set(withTiming(0.95, { duration: 90, easing: Easing.out(Easing.quad) }));
  };
  const handlePressOut = () => {
    scale.set(withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }));
  };

  return (
    <ReanimatedAnimated.View
      style={[styles.container, bottomOffset ? { bottom: BOTTOM_NAV_HEIGHT + 40 + bottomOffset } : null, animatedStyle]}
    >
      <ReanimatedAnimated.View style={scaleStyle}>
        <Pressable
          onPress={() => router.push(href as any)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.pill, { boxShadow: shadow } as ViewStyle]}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? `${label} öffnen`}
        >
          {/* Frosted pill: the outer pressable carries the shadow, the inner
              view clips the glass — same material as the map's controls. */}
          <View style={[styles.clip, { borderColor: rim }]}>
            <GlassFill dark={isDark} black={variant === 'dark'} />
            <View style={styles.content}>
              {icon ?? <LocationIcon size={16} color={colors.textPrimary} />}
              <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
            </View>
          </View>
        </Pressable>
      </ReanimatedAnimated.View>
    </ReanimatedAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: BOTTOM_NAV_HEIGHT + 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pill: {
    borderRadius: 24,
  },
  clip: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  label: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
  },
});
