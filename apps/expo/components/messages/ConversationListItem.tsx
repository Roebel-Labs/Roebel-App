import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import type { ConversationWithLastMessage } from '@/lib/supabase-messages';

type Props = {
  conversation: ConversationWithLastMessage;
  onPress: () => void;
};

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) {
    return date.toLocaleDateString('de-DE', { weekday: 'short' });
  }
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
}

function getPreviewText(message: ConversationWithLastMessage['lastMessage']): string {
  if (!message) return '';
  if (message.sticker_reward_id) return '🎁 Sticker';
  const content = message.content ?? '';
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'listing_inquiry' || parsed?.type === 'product_inquiry') {
      return `📦 ${parsed.title || 'Marktplatz-Anfrage'}`;
    }
  } catch {
    // Not JSON
  }
  return content;
}

export default function ConversationListItem({ conversation, onPress }: Props) {
  const { colors } = useTheme();
  const {
    peerAddress,
    peerProfilePictureUrl,
    peerEquippedFrameUrl,
    peerUsername,
    lastMessage,
    hasUnread,
  } = conversation;

  const displayName = peerUsername || shortenAddress(peerAddress);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
      onPress={onPress}
    >
      <UserAvatarWithFrame
        size={48}
        uri={peerProfilePictureUrl}
        fallbackInitial={(displayName[0] || '?').toUpperCase()}
        frameAssetUrl={peerEquippedFrameUrl}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.name,
              { color: colors.textPrimary },
              hasUnread && styles.nameBold,
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {lastMessage && (
            <Text style={[styles.time, { color: colors.textTertiary }]}>
              {formatTimestamp(lastMessage.created_at)}
            </Text>
          )}
        </View>
        <View style={styles.bottomRow}>
          {lastMessage ? (
            <Text
              style={[
                styles.preview,
                { color: colors.textSecondary },
                hasUnread && styles.previewBold,
              ]}
              numberOfLines={1}
            >
              {getPreviewText(lastMessage)}
            </Text>
          ) : (
            <Text style={[styles.preview, styles.previewEmpty, { color: colors.textSecondary }]}>
              Keine Nachrichten
            </Text>
          )}
          {hasUnread && (
            <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    flex: 1,
    marginRight: 8,
  },
  nameBold: {
    fontFamily: 'Inter-SemiBold',
  },
  time: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  preview: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  previewBold: {
    fontFamily: 'Inter-Medium',
  },
  previewEmpty: {
    fontStyle: 'italic',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 8,
  },
});
