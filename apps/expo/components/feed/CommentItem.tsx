import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { formatRelativeTimestamp } from '@/lib/utils';
import { openAuthorProfile, canOpenProfile } from '@/lib/profile-navigation';
import ImageZoomModal from '@/components/ImageZoomModal';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import VerifiedBadge from '@/components/VerifiedBadge';
import type { PostCommentRecord } from '@/lib/types/feed';

type Props = {
  comment: PostCommentRecord;
  isOwner?: boolean;
  onEdit?: (comment: PostCommentRecord) => void;
  onDelete?: (comment: PostCommentRecord) => void;
};

export default function CommentItem({ comment, isOwner, onEdit, onDelete }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [showActions, setShowActions] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const isOrgComment = comment.author?.account?.account_type === 'organisation';
  const displayName = (isOrgComment ? comment.author!.account!.name : comment.author?.username) || 'Unbekannt';
  const avatarUri = isOrgComment ? comment.author!.account!.avatar_url : comment.author?.profile_picture_url;
  const isVerified = comment.author?.is_verified_citizen ?? false;
  const initial = displayName.charAt(0).toUpperCase();

  const isInteractive = canOpenProfile({ author: comment.author, account: comment.author?.account });
  const openProfile = isInteractive
    ? () => openAuthorProfile(router, { author: comment.author, account: comment.author?.account })
    : undefined;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {/* Avatar */}
      <Pressable
        onPress={openProfile}
        disabled={!isInteractive}
        hitSlop={4}
        accessibilityRole={isInteractive ? 'button' : undefined}
        accessibilityLabel={isInteractive ? `Profil von ${displayName} öffnen` : undefined}
      >
        <UserAvatarWithFrame
          size={32}
          uri={avatarUri ?? null}
          fallbackInitial={initial}
          frameAssetUrl={isOrgComment ? null : comment.author?.equipped_frame_asset_url ?? null}
          disabled={isOrgComment}
        />
      </Pressable>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Pressable onPress={openProfile} disabled={!isInteractive} hitSlop={4}>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{displayName}</Text>
          </Pressable>
          {isVerified && <VerifiedBadge size={14} />}
          <Text style={[styles.time, { color: colors.textTertiary }]}>
            · {formatRelativeTimestamp(comment.created_at)}
          </Text>
          {isOwner && (
            <Pressable
              onPress={() => setShowActions((v) => !v)}
              style={styles.moreButton}
              hitSlop={8}
            >
              <Ionicons name="ellipsis-horizontal" size={14} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
        {comment.content ? (
          <Text style={[styles.text, { color: colors.textPrimary }]}>{comment.content}</Text>
        ) : null}

        {comment.sticker ? (
          <Image
            source={{ uri: comment.sticker.asset_url }}
            style={styles.sticker}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        ) : null}

        {showActions && (
          <View style={styles.actionsRow}>
            <Pressable onPress={() => { setShowActions(false); onEdit?.(comment); }}>
              <Text style={[styles.actionText, { color: colors.primary }]}>Bearbeiten</Text>
            </Pressable>
            <Pressable onPress={() => { setShowActions(false); onDelete?.(comment); }}>
              <Text style={[styles.actionText, { color: colors.error }]}>Löschen</Text>
            </Pressable>
          </View>
        )}

        {/* Comment images */}
        {comment.media_urls && comment.media_urls.length > 0 && (
          <View style={styles.imageRow}>
            {comment.media_urls.map((url, i) => (
              <Pressable key={i} onPress={() => setZoomImageUrl(url)}>
                <Image
                  source={{ uri: url }}
                  style={styles.commentImage}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              </Pressable>
            ))}
          </View>
        )}

        <ImageZoomModal
          visible={!!zoomImageUrl}
          imageUrl={zoomImageUrl || ''}
          images={comment.media_urls ?? undefined}
          onClose={() => setZoomImageUrl(null)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  time: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  text: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  imageRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  commentImage: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  sticker: {
    width: 120,
    height: 120,
    marginTop: 4,
  },
  moreButton: {
    marginLeft: 'auto',
    padding: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  actionText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
