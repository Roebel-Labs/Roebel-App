import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';

import PencilIcon from '@/assets/icons/pencil.svg';

type AnimatedScalar = { readonly value: number };

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 178;

type Props = {
  onPress: () => void;
  /** Visibility scale driven externally (1 = visible, 0 = hidden). */
  visibilityScale?: AnimatedScalar;
  /** When set, the FAB expands into a pill carrying this label (icon kept). */
  label?: string;
  accessibilityLabel?: string;
};

export default function FeedFAB({ onPress, visibilityScale, label, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const expanded = useSharedValue(label ? 1 : 0);

  useEffect(() => {
    expanded.value = withSpring(label ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [label, expanded]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * (visibilityScale?.value ?? 1) }],
    opacity: visibilityScale?.value ?? 1,
  }));

  const pillStyle = useAnimatedStyle(() => ({
    width: interpolate(expanded.value, [0, 1], [COLLAPSED_WIDTH, EXPANDED_WIDTH]),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expanded.value, [0, 0.6, 1], [0, 0, 1]),
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Animated.View
      style={[styles.container, { bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }, animatedStyle]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Neuen Beitrag erstellen'}
      >
        <Animated.View style={[styles.fab, { backgroundColor: colors.primary }, pillStyle]}>
          <PencilIcon width={24} height={24} color={colors.onPrimary} />
          {label ? (
            <Animated.Text numberOfLines={1} style={[styles.label, { color: colors.onPrimary }, labelStyle]}>
              {label}
            </Animated.Text>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 31,
    // Shadow lives on this non-clipped wrapper, not on the pill below — on
    // iOS, a view with `overflow: 'hidden'` clips its own drop shadow along
    // with its content, so the FAB would otherwise render shadowless.
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fab: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
});
