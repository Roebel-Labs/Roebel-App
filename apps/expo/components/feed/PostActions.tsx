import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';

import HeartIcon from '@/assets/icons/heart-02.svg';
import HeartFilledIcon from '@/assets/icons/heart-02-filled.svg';
import CommentIcon from '@/assets/icons/comment-02.svg';
import ShareIcon from '@/assets/icons/share-02.svg';
import RepostIcon from '@/assets/icons/repost.svg';
import ViewIcon from '@/assets/icons/view.svg';
import { formatCompactCount } from '@/lib/utils/format-count';

const HEART_PNG = require('@/assets/icons/Heart.png');

type Props = {
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  /** When true, hides numeric counts and the top divider for a cleaner row. */
  iconOnly?: boolean;
  /** 🔁 shown between comment and share when provided. */
  repostsCount?: number;
  isReposted?: boolean;
  onRepost?: () => void;
  /** Views: muted count; hidden when 0/undefined or iconOnly. Non-interactive — nobody sees who viewed. */
  viewsCount?: number;
};

export default function PostActions({
  likesCount,
  commentsCount,
  isLiked,
  onLike,
  onComment,
  onShare,
  iconOnly = false,
  repostsCount = 0,
  isReposted = false,
  onRepost,
  viewsCount,
}: Props) {
  const { colors } = useTheme();

  const showViews = !iconOnly && typeof viewsCount === 'number' && viewsCount > 0;

  const pngScale = useRef(new Animated.Value(0)).current;
  const pngRotate = useRef(new Animated.Value(0)).current;
  const pngOpacity = useRef(new Animated.Value(0)).current;
  const filledScale = useRef(new Animated.Value(isLiked ? 1 : 0)).current;
  const outlineOpacity = useRef(new Animated.Value(isLiked ? 0 : 1)).current;

  // Keep the static layers in sync when isLiked is changed externally
  // (optimistic update from parent, server reconciliation, etc.)
  useEffect(() => {
    outlineOpacity.setValue(isLiked ? 0 : 1);
    filledScale.setValue(isLiked ? 1 : 0);
  }, [isLiked, outlineOpacity, filledScale]);

  const rotateInterpolation = pngRotate.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0deg', '-15deg', '5deg'],
  });

  const handleLikePress = () => {
    if (!isLiked) {
      // Activate animation: outline hides → Heart.png plops → filled appears
      outlineOpacity.setValue(0);
      pngOpacity.setValue(1);
      pngScale.setValue(0);
      pngRotate.setValue(0);

      Animated.spring(pngScale, {
        toValue: 1.5,
        damping: 6,
        stiffness: 250,
        useNativeDriver: true,
      }).start();
      Animated.spring(pngRotate, {
        toValue: 1,
        damping: 6,
        stiffness: 250,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        Animated.parallel([
          Animated.spring(pngScale, {
            toValue: 0.85,
            damping: 10,
            stiffness: 200,
            useNativeDriver: true,
          }),
          Animated.spring(pngRotate, {
            toValue: 2,
            damping: 10,
            stiffness: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }, 350);

      setTimeout(() => {
        Animated.timing(pngOpacity, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }).start();
        filledScale.setValue(0.85);
        Animated.spring(filledScale, {
          toValue: 1,
          damping: 12,
          stiffness: 200,
          useNativeDriver: true,
        }).start();
      }, 500);
    } else {
      filledScale.setValue(0);
      Animated.timing(outlineOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    onLike();
  };

  return (
    <View
      style={[
        styles.container,
        iconOnly
          ? styles.containerIconOnly
          : { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
      ]}
    >
      <Pressable onPress={onComment} style={styles.action}>
        <CommentIcon width={22} height={22} color={colors.textPrimary} />
        {!iconOnly && commentsCount > 0 && (
          <Text style={[styles.count, { color: colors.textPrimary }]}>{commentsCount}</Text>
        )}
      </Pressable>

      {onRepost && (
        <Pressable onPress={onRepost} style={styles.action} accessibilityLabel="Reposten">
          <RepostIcon
            width={22}
            height={22}
            color={isReposted ? colors.primary : colors.textPrimary}
          />
          {!iconOnly && repostsCount > 0 && (
            <Text
              style={[styles.count, { color: isReposted ? colors.primary : colors.textPrimary }]}
            >
              {repostsCount}
            </Text>
          )}
        </Pressable>
      )}

      <Pressable onPress={onShare} style={styles.action}>
        <ShareIcon width={22} height={22} color={colors.textPrimary} />
      </Pressable>

      {showViews && (
        <View
          style={[styles.action, styles.viewsAction]}
          accessibilityLabel={`${viewsCount ?? 0} Aufrufe`}
        >
          <Text style={[styles.count, { color: colors.textTertiary }]}>
            {formatCompactCount(viewsCount ?? 0)}
          </Text>
          <ViewIcon width={18} height={18} color={colors.textTertiary} />
        </View>
      )}

      <Pressable
        onPress={handleLikePress}
        style={[styles.action, !showViews && styles.heartAction]}
      >
        {!iconOnly && likesCount > 0 && (
          <Text
            style={[
              styles.count,
              { color: isLiked ? colors.error : colors.textPrimary },
            ]}
          >
            {likesCount}
          </Text>
        )}
        <View style={styles.heartIconWrap}>
          <Animated.View style={[styles.iconBottom, { opacity: outlineOpacity }]}>
            <HeartIcon width={22} height={22} color={colors.textPrimary} />
          </Animated.View>
          <Animated.View
            style={[
              styles.iconMid,
              {
                opacity: isLiked ? 1 : 0,
                transform: [{ scale: filledScale }],
              },
            ]}
          >
            <HeartFilledIcon width={22} height={22} color={colors.error} />
          </Animated.View>
          <Animated.View
            style={[
              styles.iconTop,
              {
                opacity: pngOpacity,
                transform: [{ scale: pngScale }, { rotate: rotateInterpolation }],
              },
            ]}
          >
            <Image source={HEART_PNG} style={styles.pngImage} contentFit="contain" />
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  containerIconOnly: {
    paddingTop: 4,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  heartAction: {
    marginLeft: 'auto',
  },
  viewsAction: {
    marginLeft: 'auto',
  },
  count: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  heartIconWrap: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  iconBottom: {
    position: 'absolute',
    zIndex: 0,
  },
  iconMid: {
    position: 'absolute',
    zIndex: 1,
  },
  iconTop: {
    position: 'absolute',
    zIndex: 2,
  },
  pngImage: {
    width: 28,
    height: 28,
  },
});
