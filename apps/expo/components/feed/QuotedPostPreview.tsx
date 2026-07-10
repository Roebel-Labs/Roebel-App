import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import VerifiedBadge from '@/components/VerifiedBadge';
import { formatRelativeTimestamp } from '@/lib/utils';
import type { PostRecord } from '@/lib/types/feed';

type Props = {
  /** The quoted original. null/undefined → deleted placeholder. */
  post: PostRecord | null | undefined;
  onPress?: () => void;
};

/** Embedded mini preview of a quoted post (X-style bordered card). */
export default function QuotedPostPreview({ post, onPress }: Props) {
  const { colors } = useTheme();

  if (!post) {
    return (
      <View style={[styles.container, { borderColor: colors.border }]}>
        <Text style={[styles.deleted, { color: colors.textTertiary }]}>
          Beitrag wurde gelöscht
        </Text>
      </View>
    );
  }

  const isOrg = post.author?.account?.account_type === 'organisation';
  const name = (isOrg ? post.author?.account?.name : post.author?.username) || 'Jemand';
  const avatar = isOrg ? post.author?.account?.avatar_url : post.author?.profile_picture_url;
  const firstImage = post.media_urls?.filter(Boolean)?.[0];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.container,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={styles.authorRow}>
        <UserAvatarWithFrame
          size={20}
          uri={avatar ?? null}
          fallbackInitial={name.charAt(0).toUpperCase()}
          frameAssetUrl={null}
        />
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {post.author?.is_verified_citizen && <VerifiedBadge size={13} />}
        <Text style={[styles.time, { color: colors.textTertiary }]}>
          · {formatRelativeTimestamp(post.created_at)}
        </Text>
      </View>
      {post.content ? (
        <Text style={[styles.content, { color: colors.textPrimary }]} numberOfLines={3}>
          {post.content}
        </Text>
      ) : null}
      {firstImage && (
        <Image
          source={{ uri: firstImage }}
          style={styles.image}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    flexShrink: 1,
  },
  time: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  content: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  image: {
    width: '100%',
    height: 140,
    borderRadius: 8,
  },
  deleted: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
});
