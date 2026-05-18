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

function PulseRow({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function AccountRowSkeleton() {
  const { colors } = useTheme();
  return (
    <PulseRow>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Skeleton width={44} height={44} borderRadius={22} />
        <View style={styles.body}>
          <Skeleton width="55%" height={14} borderRadius={4} />
          <Skeleton width="32%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      </View>
    </PulseRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
  },
});
