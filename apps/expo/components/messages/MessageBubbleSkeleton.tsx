import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Skeleton } from '@/components/SkeletonLoader';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  mine?: boolean;
  width?: number | string;
};

function usePulse() {
  const opacity = useSharedValue(0.6);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export default function MessageBubbleSkeleton({ mine = false, width = '62%' }: Props) {
  const pulseStyle = usePulse();
  return (
    <Animated.View
      style={[
        styles.row,
        mine ? styles.rowMine : styles.rowPeer,
        pulseStyle,
      ]}
    >
      <View style={{ width: width as any }}>
        <Skeleton width="100%" height={36} borderRadius={18} />
      </View>
    </Animated.View>
  );
}

export function ChatLoadingSkeletons() {
  const { colors: _colors } = useTheme();
  // Alternating widths feel like a real conversation, not a uniform stack.
  return (
    <View style={styles.stack}>
      <MessageBubbleSkeleton mine={false} width={'58%'} />
      <MessageBubbleSkeleton mine={true} width={'42%'} />
      <MessageBubbleSkeleton mine={false} width={'68%'} />
      <MessageBubbleSkeleton mine={true} width={'36%'} />
      <MessageBubbleSkeleton mine={false} width={'48%'} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    // Fill the message area so the sibling input bar stays pinned to the
    // bottom of the screen while the thread is still loading.
    flex: 1,
    paddingVertical: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowPeer: {
    justifyContent: 'flex-start',
  },
});
