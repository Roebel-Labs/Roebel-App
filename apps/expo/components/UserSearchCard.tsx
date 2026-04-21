import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import TierBadge from './RoleBadge';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import LocationSmallIcon from '@/assets/icons/location-small.svg';
import type { UserRecord } from '@/lib/types';

type Props = {
  user: UserRecord;
  onPress?: () => void;
};

export default function UserSearchCard({ user, onPress }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const handlePress = () => {
    if (onPress) onPress();
    router.push(`/user/${user.username}` as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={user.username || 'Benutzer'}
    >
      {/* Avatar */}
      <UserAvatarWithFrame
        size={44}
        uri={user.profile_picture_url}
        fallbackInitial={(user.username || '?').charAt(0).toUpperCase()}
        frameAssetUrl={user.equipped_frame_asset_url ?? null}
      />

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.username, { color: colors.textPrimary }]} numberOfLines={1}>
            @{user.username}
          </Text>
          {user.is_verified_citizen && (
            <Text style={[styles.verifiedCheck, { color: colors.success }]}>✓</Text>
          )}
          <TierBadge tier={user.tier} />
        </View>
        {user.bio && (
          <Text style={[styles.bio, { color: colors.textSecondary }]} numberOfLines={1}>
            {user.bio}
          </Text>
        )}
        {user.neighborhood && (
          <View style={styles.locationRow}>
            <LocationSmallIcon width={12} height={12} color={colors.textTertiary} />
            <Text style={[styles.neighborhood, { color: colors.textTertiary }]}>{user.neighborhood}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    flexShrink: 1,
  },
  verifiedCheck: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  bio: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  neighborhood: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
