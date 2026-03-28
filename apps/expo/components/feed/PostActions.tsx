import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

import FavouriteIcon from '@/assets/icons/favourite.svg';
import FavouriteFilledIcon from '@/assets/icons/favourite_filled.svg';
import CommentIcon from '@/assets/icons/comment-02.svg';
import SendIcon from '@/assets/icons/sent.svg';

type Props = {
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onMore?: () => void;
};

export default function PostActions({
  likesCount,
  commentsCount,
  isLiked,
  onLike,
  onComment,
  onShare,
  onMore,
}: Props) {
  const { colors } = useTheme();
  const heartScale = useSharedValue(1);

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleLikePress = () => {
    if (!isLiked) {
      heartScale.value = withSequence(
        withSpring(1.3, { damping: 10, stiffness: 400 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
    } else {
      heartScale.value = withSequence(
        withTiming(0.85, { duration: 100 }),
        withSpring(1, { damping: 14, stiffness: 300 })
      );
    }
    onLike();
  };

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <Pressable onPress={handleLikePress} style={styles.action}>
        <Animated.View style={heartAnimatedStyle}>
          {isLiked ? (
            <FavouriteFilledIcon width={20} height={20} color={colors.error} />
          ) : (
            <FavouriteIcon width={20} height={20} color={colors.textSecondary} />
          )}
        </Animated.View>
        {likesCount > 0 && (
          <Text style={[styles.count, { color: isLiked ? colors.error : colors.textSecondary }]}>
            {likesCount}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={onComment} style={styles.action}>
        <CommentIcon width={20} height={20} color={colors.textSecondary} />
        {commentsCount > 0 && (
          <Text style={[styles.count, { color: colors.textSecondary }]}>{commentsCount}</Text>
        )}
      </Pressable>

      <Pressable onPress={onShare} style={styles.action}>
        <SendIcon width={20} height={20} color={colors.textSecondary} />
      </Pressable>

      {onMore && (
        <Pressable onPress={onMore} style={styles.moreButton}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    marginTop: 10,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  count: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  moreButton: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
});
