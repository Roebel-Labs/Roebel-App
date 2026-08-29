import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { transformedImageUrl } from '@/lib/image-url';
import { formatRelativeTimestamp } from '@/lib/utils';
import { fontFamily } from '@/constants/theme';
import type { ActivityKind } from '@/lib/notification-display';

import HeartIcon from '@/assets/icons/heart-02-filled.svg';
import CommentIcon from '@/assets/icons/comment-02.svg';
import UserIcon from '@/assets/icons/user.svg';
import BellIcon from '@/assets/icons/notification-01.svg';

const AVATAR_SIZE = 40;
const BADGE_SIZE = 20;

/**
 * Fixed, saturated badge accents (Threads-style). The white glyph plus the
 * background-colored ring keeps them legible on both themes; the news/system
 * badge uses the theme primary so it stays on-brand in dark mode.
 */
const BADGE_COLORS: Partial<Record<ActivityKind, string>> = {
  like: '#FF2D55',
  comment: '#1FA1FF',
  invite: '#7C5CFC',
};

function BadgeGlyph({ kind }: { kind: ActivityKind }) {
  const size = 11;
  switch (kind) {
    case 'like':
      return <HeartIcon width={size} height={size} color="#FFFFFF" />;
    case 'comment':
      return <CommentIcon width={size} height={size} color="#FFFFFF" />;
    case 'invite':
      return <UserIcon width={size} height={size} color="#FFFFFF" />;
    default:
      return <BellIcon width={size} height={size} color="#FFFFFF" />;
  }
}

type Props = {
  name: string;
  /** ISO timestamp, rendered as a relative time next to the name. */
  timestamp: string;
  kind: ActivityKind;
  avatarUri?: string | null;
  fallbackInitial?: string;
  /** Replaces the photo avatar (news/system rows render an icon circle). Suppresses the badge. */
  iconAvatar?: React.ReactNode;
  /** Gray action line under the name, e.g. "Gefällt dein Beitrag". */
  action?: string | null;
  /** Content excerpt (comment text) shown in primary text color. */
  preview?: string | null;
  unread?: boolean;
  onPress?: () => void;
  onPressAvatar?: () => void;
};

export default function ActivityRow({
  name,
  timestamp,
  kind,
  avatarUri,
  fallbackInitial,
  iconAvatar,
  action,
  preview,
  unread,
  onPress,
  onPressAvatar,
}: Props) {
  const { colors } = useTheme();
  const badgeColor = BADGE_COLORS[kind] ?? colors.primary;

  const avatar = iconAvatar ? (
    <View
      style={[
        styles.avatar,
        { backgroundColor: colors.primaryLight },
      ]}
    >
      {iconAvatar}
    </View>
  ) : (
    <View style={[styles.avatar, { backgroundColor: colors.cardPlaceholder }]}>
      {avatarUri ? (
        <ExpoImage
          source={{ uri: transformedImageUrl(avatarUri, { width: 160 }) ?? undefined }}
          style={styles.avatarImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          recyclingKey={avatarUri}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
          {fallbackInitial ?? '?'}
        </Text>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <Pressable
        onPress={onPressAvatar}
        disabled={!onPressAvatar}
        style={styles.avatarWrap}
        hitSlop={4}
      >
        {avatar}
        {!iconAvatar && (
          <View
            style={[
              styles.badge,
              { backgroundColor: badgeColor, borderColor: colors.background },
            ]}
          >
            <BadgeGlyph kind={kind} />
          </View>
        )}
      </Pressable>

      <View style={[styles.content, { borderBottomColor: colors.borderTertiary }]}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.name, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.time, { color: colors.textTertiary }]}>
            {formatRelativeTimestamp(timestamp)}
          </Text>
          {unread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
        </View>
        {!!action && (
          <Text style={[styles.action, { color: colors.textSecondary }]} numberOfLines={1}>
            {action}
          </Text>
        )}
        {!!preview && (
          <Text
            style={[styles.preview, { color: colors.textPrimary }]}
            numberOfLines={3}
          >
            {preview}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 16,
    paddingTop: 12,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    marginRight: 12,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarInitial: {
    fontSize: 17,
    fontFamily: fontFamily.semiBold,
  },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingRight: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  time: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  action: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    marginTop: 1,
  },
  preview: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    lineHeight: 20,
    marginTop: 2,
  },
});
