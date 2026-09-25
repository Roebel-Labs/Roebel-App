import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { BotAvatar } from './BotAvatar';
import { BotAvatarStack } from './BotAvatarStack';
import { TopicChip } from './TopicChip';
import { chatFont, chatSize, useChatTokens } from './tokens';

export type ChatListRowProps = {
  title: string;
  /** Optional grey chip after the name ("Essensplanung"). */
  topic?: string | null;
  /** Preformatted time label — see formatListTime(). */
  time: string;
  preview?: string | null;
  /** One spec = single avatar, 2+ = group stack. */
  avatars: BotAvatarSpec[];
  online?: boolean;
  unread?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Chat list row (refs 5, 6): 42pt avatar, name + chip + time, one-line preview. */
export function ChatListRow({
  title,
  topic,
  time,
  preview,
  avatars,
  online,
  unread,
  onPress,
  onLongPress,
  style,
}: ChatListRowProps) {
  const t = useChatTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${preview ? `, ${preview}` : ''}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: t.chipBackground } : null, style]}
    >
      <View style={styles.avatar}>
        {avatars.length > 1 ? (
          <BotAvatarStack specs={avatars} size={chatSize.listAvatar} />
        ) : avatars[0] ? (
          <BotAvatar spec={avatars[0]} size={chatSize.listAvatar} online={online} />
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.titleWrap}>
            <Text
              numberOfLines={1}
              style={[styles.title, { color: t.textPrimary }, unread ? styles.titleUnread : null]}
            >
              {title}
            </Text>
            {topic ? <TopicChip label={topic} style={styles.chip} /> : null}
          </View>
          <Text style={[styles.time, { color: unread ? t.link : t.textTertiary }]}>{time}</Text>
        </View>
        {preview ? (
          <Text numberOfLines={1} style={[styles.preview, { color: unread ? t.textPrimary : t.textSecondary }]}>
            {preview}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** "22:51" today, "Gestern", weekday within 6 days, else "12.09.". */
export function formatListTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Gestern';
  if (days < 7) return d.toLocaleDateString('de-DE', { weekday: 'short' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 23, paddingVertical: 15, minHeight: 80 },
  avatar: { width: chatSize.listAvatar, height: chatSize.listAvatar, marginTop: 2 },
  body: { flex: 1, marginLeft: 17, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  title: { fontFamily: chatFont.medium, fontSize: 17, letterSpacing: -0.2, flexShrink: 1 },
  titleUnread: { fontFamily: chatFont.semiBold },
  chip: { flexShrink: 1 },
  time: { fontFamily: chatFont.regular, fontSize: 15 },
  preview: { fontFamily: chatFont.regular, fontSize: 16, marginTop: 4, letterSpacing: -0.1 },
});

export default ChatListRow;
