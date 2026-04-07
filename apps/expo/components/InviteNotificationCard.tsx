import React, { useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import OrgRoleBadge from '@/components/OrgRoleBadge';
import type { UserNotification, OrgRole } from '@/lib/types';

type Props = {
  notification: UserNotification;
  onAccept: (notification: UserNotification) => Promise<void>;
  onDecline: (notification: UserNotification) => Promise<void>;
  orgAvatarUrl?: string | null;
};

export default function InviteNotificationCard({ notification, onAccept, onDecline, orgAvatarUrl }: Props) {
  const { colors, isDark } = useTheme();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [resolved, setResolved] = useState<'accepted' | 'declined' | null>(null);

  const metadata = notification.metadata as { account_id?: string; role?: OrgRole; invitation_id?: string };
  const role = metadata.role || 'member';
  const isRead = notification.is_read;
  const isResolved = resolved || isRead;

  const timeAgo = formatTimeAgo(notification.created_at);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept(notification);
      setResolved('accepted');
    } catch {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    setIsDeclining(true);
    try {
      await onDecline(notification);
      setResolved('declined');
    } catch {
      setIsDeclining(false);
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface },
        !isResolved && styles.unreadBorder,
        !isResolved && { borderLeftColor: isDark ? '#8AB4F8' : '#194383' },
      ]}
    >
      <View style={styles.header}>
        {orgAvatarUrl ? (
          <Image source={{ uri: orgAvatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE' }]}>
            <Text style={styles.avatarEmoji}>🏢</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={[styles.time, { color: colors.textTertiary }]}>{timeAgo}</Text>
        </View>
        {!isResolved && (
          <View style={[styles.unreadDot, { backgroundColor: isDark ? '#8AB4F8' : '#194383' }]} />
        )}
      </View>

      <View style={styles.bodyRow}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Du wurdest als{' '}
        </Text>
        <OrgRoleBadge role={role} />
        <Text style={[styles.body, { color: colors.textSecondary }]}> eingeladen</Text>
      </View>

      {!isResolved ? (
        <View style={styles.actions}>
          <Pressable
            onPress={handleAccept}
            disabled={isAccepting || isDeclining}
            style={[
              styles.acceptButton,
              { backgroundColor: isDark ? '#8AB4F8' : '#194383' },
              (isAccepting || isDeclining) && styles.disabledButton,
            ]}
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.acceptText, { color: isDark ? '#1a1a2e' : '#FFFFFF' }]}>Annehmen</Text>
            )}
          </Pressable>
          <Pressable
            onPress={handleDecline}
            disabled={isAccepting || isDeclining}
            style={[
              styles.declineButton,
              { borderColor: colors.border },
              (isAccepting || isDeclining) && styles.disabledButton,
            ]}
          >
            {isDeclining ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={[styles.declineText, { color: colors.textSecondary }]}>Ablehnen</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Text
          style={[
            styles.resolvedText,
            {
              color: resolved === 'accepted' || (!resolved && isRead)
                ? isDark ? '#8AB4F8' : '#194383'
                : colors.textTertiary,
            },
          ]}
        >
          {resolved === 'accepted' || (!resolved && isRead) ? '✓ Angenommen' : '✗ Abgelehnt'}
        </Text>
      )}
    </View>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  unreadBorder: {
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  time: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  body: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  disabledButton: {
    opacity: 0.6,
  },
  resolvedText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginTop: 4,
  },
});
