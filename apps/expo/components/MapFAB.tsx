import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ReanimatedAnimated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import ContrastPill from '@/components/ContrastPill';
import { LocationIcon } from '@/components/Icons';
import { contrastPillBottom } from '@/lib/contrast-pill';

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
  const insets = useSafeAreaInsets();
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

  return (
    <ReanimatedAnimated.View
      style={[styles.container, { bottom: contrastPillBottom(insets.bottom) + bottomOffset }, animatedStyle]}
    >
      <ContrastPill
        label={label}
        onPress={() => router.push(href as any)}
        leading={icon ?? ((p) => <LocationIcon size={17} color={p.active} />)}
        accessibilityLabel={accessibilityLabel ?? `${label} öffnen`}
      />
    </ReanimatedAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
});
