import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { formatRelativeTimestamp } from '@/lib/utils';
import type { ImageSource } from 'expo-image';
import type { PostAuthor, PostCategory } from '@/lib/types/feed';
import { POST_CATEGORY_LABELS } from '@/lib/types/feed';

type Props = {
  author: PostAuthor | undefined;
  category?: PostCategory;
  createdAt: string;
  /** Override label shown instead of username (e.g., "Mecky Bot") */
  nameOverride?: string;
  /** Override avatar — URI string or local require() source */
  avatarOverride?: string | ImageSource;
  /** Extra label shown after the author name (e.g., "Gesponsert") */
  badge?: string;
};

export default function PostAuthorRow({
  author,
  category,
  createdAt,
  nameOverride,
  avatarOverride,
  badge,
}: Props) {
  const { colors } = useTheme();

  const displayName = nameOverride || author?.username || 'Unbekannt';
  const avatarUri = typeof avatarOverride === 'string' ? avatarOverride : undefined;
  const avatarSource = typeof avatarOverride === 'object' ? avatarOverride : undefined;
  const profilePic = avatarUri || author?.profile_picture_url;
  const isVerified = author?.is_verified_citizen ?? false;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      {avatarSource ? (
        <Image source={avatarSource} style={styles.avatar} contentFit="cover" />
      ) : profilePic ? (
        <Image source={{ uri: profilePic }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
        </View>
      )}

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          {isVerified && (
            <View style={[styles.verifiedBadge, { backgroundColor: colors.success }]}>
              <Text style={styles.verifiedCheck}>✓</Text>
            </View>
          )}
          {badge && (
            <Text style={[styles.badge, { color: colors.textTertiary }]}>{badge}</Text>
          )}
        </View>

        <View style={styles.metaRow}>
          {category && category !== 'generell' && (
            <>
              <Text style={[styles.categoryLabel, { color: colors.primary }]}>
                {POST_CATEGORY_LABELS[category]}
              </Text>
              <Text style={[styles.dot, { color: colors.textTertiary }]}>·</Text>
            </>
          )}
          <Text style={[styles.time, { color: colors.textTertiary }]}>
            {formatRelativeTimestamp(createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    flexShrink: 1,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedCheck: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  badge: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  dot: {
    fontSize: 12,
  },
  time: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
