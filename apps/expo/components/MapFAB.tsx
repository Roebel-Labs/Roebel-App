import React, { useRef } from 'react';
import { Pressable, Text, StyleSheet, View, Animated as RNAnimated } from 'react-native';
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
import GlassSurface, { glassEdgeColor } from '@/components/GlassSurface';
import { LocationIcon } from '@/components/Icons';
import { softShadow } from '@/lib/shadow';
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
};

export default function MapFAB({
  visible,
  label = 'Karte',
  href = '/location',
  icon,
  accessibilityLabel,
}: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;
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

  const handlePressIn = () => {
    RNAnimated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    RNAnimated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <ReanimatedAnimated.View style={[styles.container, animatedStyle]}>
      <RNAnimated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPress={() => router.push(href as any)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.pill, softShadow(2, isDark)]}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? `${label} öffnen`}
        >
          {/* Frosted pill: the outer pressable carries the shadow, the inner
              view clips the glass — same material as the map's controls. */}
          <View style={[styles.clip, { borderColor: glassEdgeColor(isDark) }]}>
            <GlassSurface />
            <View style={styles.content}>
              {icon ?? <LocationIcon size={16} color={colors.textPrimary} />}
              <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
            </View>
          </View>
        </Pressable>
      </RNAnimated.View>
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
