import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import PostAuthorRow from './PostAuthorRow';
import PostImageGrid from './PostImageGrid';
import ImageZoomModal from '@/components/ImageZoomModal';
import ProposalPreviewCard from './ProposalPreviewCard';
import type { ProposalCommentFeedRecord } from '@/lib/types/feed';

type Props = {
  comment: ProposalCommentFeedRecord;
};

export default function FeedProposalCommentCard({ comment }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const proposalId = comment.proposal?.proposal_id || comment.proposal_id;

  const handlePress = () => {
    if (proposalId) router.push(`/proposal/${proposalId}?commentId=${comment.id}` as any);
  };

  const imageUrls = comment.media_urls?.filter(Boolean) ?? [];

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.authorContainer}>
          <PostAuthorRow author={comment.author} createdAt={comment.created_at} />
        </View>
        <View style={[styles.kindChip, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="chatbubble-outline" size={11} color={colors.primary} />
          <Text style={[styles.kindText, { color: colors.primary }]}>Kommentar</Text>
        </View>
      </View>

      {comment.emoji ? (
        <Text style={styles.emoji}>{comment.emoji}</Text>
      ) : null}

      {comment.content ? (
        <Text style={[styles.content, { color: colors.textPrimary }]} numberOfLines={4}>
          {comment.content}
        </Text>
      ) : null}

      {imageUrls.length > 0 && (
        <PostImageGrid imageUrls={imageUrls} onPress={(i) => setZoomImageUrl(imageUrls[i])} />
      )}

      {comment.video_url && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            Linking.openURL(comment.video_url!);
          }}
          style={[styles.videoPlaceholder, { borderColor: colors.border }]}
        >
          <Ionicons name="play-circle" size={20} color={colors.primary} />
          <Text style={[styles.videoLabel, { color: colors.textSecondary }]}>Video abspielen</Text>
        </Pressable>
      )}

      {comment.proposal && <ProposalPreviewCard proposal={comment.proposal} />}

      <ImageZoomModal
        visible={!!zoomImageUrl}
        imageUrl={zoomImageUrl || ''}
        onClose={() => setZoomImageUrl(null)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  authorContainer: {
    flex: 1,
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  kindText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  emoji: {
    fontSize: 28,
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
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  videoLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
