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

export default function ConversationRowSkeleton() {
  const { colors } = useTheme();
  return (
    <PulseRow>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Skeleton width={48} height={48} borderRadius={24} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Skeleton width="50%" height={15} borderRadius={4} />
            <Skeleton width={36} height={12} borderRadius={4} />
          </View>
          <Skeleton width="78%" height={13} borderRadius={4} style={{ marginTop: 8 }} />
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
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  body: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
