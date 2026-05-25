import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { ThumbsUpIcon, ThumbsUpFilledIcon, ThumbsDownIcon } from '@/components/Icons';

type Props = {
  /** Number of thumbs-up. Pass null to render nothing in read-only mode. */
  upCount: number | null;
  size?: 'sm' | 'md';
  interactive?: boolean;
  userVote?: 1 | -1 | null;
  onVote?: (v: 1 | -1) => void;
};

/**
 * Thumbs voting widget. Shows ONLY the thumbs-up count (never a percentage,
 * never a thumbs-down count). The count is rendered in the primary text color
 * (black in light mode, adapts in dark) with medium weight. The active "liked"
 * state is black (not green) and pops with a spring animation on tap. Custom
 * thumb icons are theme-aware via the `color` prop (SVGs use currentColor).
 */
export default function ThumbsVote({
  upCount,
  size = 'sm',
  interactive,
  userVote,
  onVote,
}: Props) {
  const { colors } = useTheme();
  const fontSize = size === 'sm' ? 12 : 14;
  const iconSize = size === 'sm' ? 12 : 14;

  // Hooks must run unconditionally (before the read-only early return).
  const upScale = useSharedValue(1);
  const upAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: upScale.value }] }));

  if (!interactive) {
    if (upCount == null) return null;
    return (
      <View style={styles.row}>
        <ThumbsUpIcon size={iconSize} color={colors.textSecondary} />
        <Text style={[styles.count, { color: colors.textPrimary, fontSize }]}>{upCount}</Text>
      </View>
    );
  }

  const upActive = userVote === 1;
  const downActive = userVote === -1;

  const handleUp = () => {
    upScale.value = withSequence(
      withSpring(1.25, { damping: 6, stiffness: 260 }),
      withSpring(1, { damping: 12, stiffness: 200 }),
    );
    onVote?.(1);
  };

  return (
    <View style={styles.rowGap}>
      <Pressable
        onPress={handleUp}
        accessibilityLabel="Daumen hoch"
        style={[
          styles.pill,
          {
            borderColor: upActive ? colors.textPrimary : colors.borderSecondary,
            backgroundColor: upActive ? colors.surfaceSecondary : 'transparent',
          },
        ]}
      >
        <Animated.View style={upAnimStyle}>
          {upActive ? (
            <ThumbsUpFilledIcon size={18} color={colors.textPrimary} />
          ) : (
            <ThumbsUpIcon size={18} color={colors.textSecondary} />
          )}
        </Animated.View>
        {upCount != null && upCount > 0 && (
          <Text style={[styles.pillCount, { color: colors.textPrimary }]}>{upCount}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => onVote?.(-1)}
        accessibilityLabel="Daumen runter"
        style={[
          styles.pill,
          {
            borderColor: downActive ? colors.error : colors.borderSecondary,
            backgroundColor: downActive ? colors.errorBackground : 'transparent',
          },
        ]}
      >
        <ThumbsDownIcon size={18} color={downActive ? colors.error : colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { fontFamily: 'Inter-Medium' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillCount: { fontFamily: 'Inter-Medium', fontSize: 13 },
});
