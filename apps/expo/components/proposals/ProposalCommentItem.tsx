import { useEffect, useRef, useState, type RefObject } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, Linking, ScrollView, findNodeHandle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import PostImageGrid from '@/components/feed/PostImageGrid';
import ImageZoomModal from '@/components/ImageZoomModal';
import FavouriteIcon from '@/assets/icons/favourite.svg';
import FavouriteFilledIcon from '@/assets/icons/favourite_filled.svg';
import { toggleProposalCommentLike } from '@/lib/supabase-proposal-comments';
import type { ProposalCommentRecord } from '@/lib/supabase-proposal-comments';

type Props = {
  comment: ProposalCommentRecord;
  isOwner: boolean;
  walletAddress?: string;
  onDelete?: (comment: ProposalCommentRecord) => void;
  isHighlighted?: boolean;
  scrollViewRef?: RefObject<ScrollView | null>;
};

export default function ProposalCommentItem({
  comment,
  isOwner,
  walletAddress,
  onDelete,
  isHighlighted = false,
  scrollViewRef,
}: Props) {
  const { colors } = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [showHighlight, setShowHighlight] = useState(false);
  const cardRef = useRef<View>(null);

  // Scroll into view + briefly flash when this comment is the deeplink target.
  useEffect(() => {
    if (!isHighlighted) return;
    const node = cardRef.current;
    const scrollNode = scrollViewRef?.current ? findNodeHandle(scrollViewRef.current) : null;
    if (!node || !scrollNode) return;
    const measureTimer = setTimeout(() => {
      node.measureLayout(
        scrollNode,
        (_x, y) => scrollViewRef?.current?.scrollTo({ y: Math.max(0, y - 24), animated: true }),
        () => {},
      );
    }, 250);
    setShowHighlight(true);
    const fadeTimer = setTimeout(() => setShowHighlight(false), 2200);
    return () => {
      clearTimeout(measureTimer);
      clearTimeout(fadeTimer);
    };
  }, [isHighlighted, scrollViewRef]);

  const [isLiked, setIsLiked] = useState<boolean>(!!comment.is_liked);
  const [likeCount, setLikeCount] = useState<number>(comment.likes_count ?? 0);

  const heartScale = useSharedValue(1);
  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleLikePress = async () => {
    if (!walletAddress) return;
    if (!isLiked) {
      heartScale.value = withSequence(
        withSpring(1.3, { damping: 10, stiffness: 400 }),
        withSpring(1, { damping: 12, stiffness: 300 }),
      );
    } else {
      heartScale.value = withSequence(
        withTiming(0.85, { duration: 100 }),
        withSpring(1, { damping: 14, stiffness: 300 }),
      );
    }
    const previousLiked = isLiked;
    const previousCount = likeCount;
    const nextLiked = !previousLiked;
    setIsLiked(nextLiked);
    setLikeCount(previousCount + (nextLiked ? 1 : -1));
    try {
      const persisted = await toggleProposalCommentLike(comment.id, walletAddress);
      if (persisted !== nextLiked) {
        setIsLiked(persisted);
        setLikeCount(previousCount + (persisted ? 1 : -1));
      }
    } catch {
      setIsLiked(previousLiked);
      setLikeCount(previousCount);
    }
  };

  const handleDelete = () => {
    Alert.alert('Kommentar löschen', 'Möchtest du diesen Kommentar wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => onDelete?.(comment),
      },
    ]);
  };

  const imageUrls = comment.media_urls?.filter(Boolean) ?? [];

  return (
    <View
      ref={cardRef}
      style={[
        styles.card,
        { borderBottomColor: colors.border },
        showHighlight && { backgroundColor: colors.primaryLight },
      ]}
    >
      {comment.emoji ? (
        <View style={[styles.emojiBanner, { backgroundColor: colors.primaryLight }]}>
          <Text style={styles.emoji}>{comment.emoji}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.authorContainer}>
            <PostAuthorRow author={comment.author} createdAt={comment.created_at} />
          </View>
          {isOwner && (
            <Pressable
              onPress={() => setMenuVisible(!menuVisible)}
              hitSlop={8}
              style={styles.menuButton}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {menuVisible && isOwner && (
          <Pressable
            onPress={handleDelete}
            style={[styles.deleteOption, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Text style={[styles.deleteText, { color: colors.error }]}>Löschen</Text>
          </Pressable>
        )}

        {comment.content ? (
          <Text style={[styles.content, { color: colors.textPrimary }]}>{comment.content}</Text>
        ) : null}

        {imageUrls.length > 0 && (
          <PostImageGrid imageUrls={imageUrls} onPress={(i) => setZoomImageUrl(imageUrls[i])} />
        )}

        <ImageZoomModal
          visible={!!zoomImageUrl}
          imageUrl={zoomImageUrl || ''}
          onClose={() => setZoomImageUrl(null)}
        />

        {comment.video_url && (
          <Pressable
            onPress={() => Linking.openURL(comment.video_url!)}
            style={[styles.videoPlaceholder, { borderColor: colors.border }]}
          >
            <Ionicons name="play-circle" size={24} color={colors.primary} />
            <Text style={[styles.videoLabel, { color: colors.textSecondary }]}>Video abspielen</Text>
          </Pressable>
        )}

        <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleLikePress}
            style={styles.action}
            disabled={!walletAddress}
            hitSlop={8}
          >
            <Animated.View style={heartAnimatedStyle}>
              {isLiked ? (
                <FavouriteFilledIcon width={18} height={18} color={colors.error} />
              ) : (
                <FavouriteIcon width={18} height={18} color={colors.textSecondary} />
              )}
            </Animated.View>
            {likeCount > 0 && (
              <Text
                style={[
                  styles.likeCount,
                  { color: isLiked ? colors.error : colors.textSecondary },
                ]}
              >
                {likeCount}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emojiBanner: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emoji: {
    fontSize: 48,
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorContainer: {
    flex: 1,
  },
  menuButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  deleteOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  deleteText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  content: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  videoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  videoLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  likeCount: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
