import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarIcon, BookIcon } from '@/components/Icons';
import { formatRelativeTimestamp } from '@/lib/utils';
import type { NotificationLogEntry } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  notification: NotificationLogEntry;
  isRead: boolean;
  onPress: (notification: NotificationLogEntry) => void;
};

function getNotificationIcon(notificationType: string, color: string) {
  if (notificationType.startsWith('news')) {
    return <BookIcon size={20} color={color} />;
  }
  return <CalendarIcon size={20} color={color} />;
}

export default function NotificationCard({ notification, isRead, onPress }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const handlePress = () => {
    onPress(notification);

    const data = notification.data;
    if (data?.type === 'event' && data?.eventId) {
      router.push(`/event/${data.eventId}` as any);
    } else if (data?.type === 'news' && data?.slug) {
      router.push(`/news/${data.slug}` as any);
    }
  };

  return (
    <Pressable
      style={[styles.container, { borderBottomColor: colors.border, backgroundColor: colors.background }]}
      onPress={handlePress}
    >
      {!isRead && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
      <View style={[styles.iconContainer, { backgroundColor: isRead ? colors.surface : colors.primaryLight }]}>
        {getNotificationIcon(notification.notification_type, colors.textSecondary)}
      </View>
      <View style={styles.content}>
        <Text
          style={[styles.title, { color: colors.textPrimary, fontFamily: isRead ? 'Inter-Regular' : 'Inter-Medium' }]}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
      <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
        {formatRelativeTimestamp(notification.created_at)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    marginTop: 6,
    marginRight: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
});
