import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { chatFont, useChatTokens } from '@/components/chat/tokens';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { safeDisplayName, type ConversationWithLastMessage } from '@/lib/supabase-messages';
import { cleanNotificationBody } from '@/lib/notification-display';

// Rounded-square ("squircle") avatars, a touch larger than the app's
// default 48 px circles — the messenger list reads by faces first.
export const AVATAR_SIZE = 56;
export const AVATAR_RADIUS = 20;

type Props = {
  conversation: ConversationWithLastMessage;
  onPress: () => void;
};

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
  // Shared with notification rendering: marketplace inquiries (JSON payloads)
  // become a short "📦 …" preview instead of raw JSON.
  return cleanNotificationBody(message.content ?? '');
}

export default function ConversationListItem({ conversation, onPress }: Props) {
  const t = useChatTokens();
  const {
    peerName,
    peerAvatarUrl,
    peerEquippedFrameUrl,
    peerUsername,
    peerAccountType,
    lastMessage,
    hasUnread,
  } = conversation;

  const displayName = safeDisplayName(peerName, peerUsername);
  // Personal accounts carry an equipped frame from their owner wallet's
  // users row; orgs never do.
  const frameUrl = peerAccountType === 'personal' ? peerEquippedFrameUrl : null;
  const preview = lastMessage ? getPreviewText(lastMessage) : 'Keine Nachrichten';

  // Same anatomy as the Mecky chat list (ChatListRow): no dividers, airy
  // padding, blue time + dark preview when unread.
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.chipBackground }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${preview}`}
    >
      <UserAvatarWithFrame
        size={AVATAR_SIZE}
        radius={AVATAR_RADIUS}
        uri={peerAvatarUrl}
        fallbackInitial={(displayName[0] || '?').toUpperCase()}
        frameAssetUrl={frameUrl}
      />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text
            style={[styles.title, { color: t.textPrimary }, hasUnread && styles.titleUnread]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {lastMessage && (
            <Text style={[styles.time, { color: hasUnread ? t.link : t.textTertiary }]}>
              {formatTimestamp(lastMessage.created_at)}
            </Text>
          )}
        </View>
        <View style={styles.bottom}>
          <Text
            style={[
              styles.preview,
              { color: hasUnread ? t.textPrimary : t.textSecondary },
              !lastMessage && styles.previewEmpty,
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {hasUnread && <View style={[styles.unreadDot, { backgroundColor: t.link }]} />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 15,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: chatFont.medium,
    letterSpacing: -0.2,
  },
  titleUnread: {
    fontFamily: chatFont.semiBold,
  },
  time: {
    fontSize: 15,
    fontFamily: chatFont.regular,
  },
  preview: {
    flex: 1,
    fontSize: 16,
    fontFamily: chatFont.regular,
    letterSpacing: -0.1,
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
