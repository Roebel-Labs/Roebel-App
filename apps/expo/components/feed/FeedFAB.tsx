import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';

import PencilIcon from '@/assets/icons/pencil.svg';

type AnimatedScalar = { readonly value: number };

type Props = {
  onPress: () => void;
  /** Visibility scale driven externally (1 = visible, 0 = hidden). */
  visibilityScale?: AnimatedScalar;
};

export default function FeedFAB({ onPress, visibilityScale }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * (visibilityScale?.value ?? 1) }],
    opacity: visibilityScale?.value ?? 1,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel="Neuen Beitrag erstellen"
      >
        <PencilIcon width={24} height={24} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
