import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import ShieldUserIcon from '@/assets/icons/profile/shield-user.svg';
import { softShadow } from '@/lib/shadow';

interface ProfileHeaderCardProps {
  name: string;
  avatarUrl?: string | null;
  isCitizen: boolean;
  onPress: () => void;
}

export default function ProfileHeaderCard({ name, avatarUrl, isCitizen, onPress }: ProfileHeaderCardProps) {
  const { colors, isDark } = useTheme();
  const cardBg = isDark ? colors.surface : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg, opacity: pressed ? 0.95 : 1 },
        softShadow(2, isDark),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Profil von ${name} öffnen`}
    >
      <UserAvatarWithFrame
        size={56}
        uri={avatarUrl ?? null}
        fallbackInitial={(name || '?').charAt(0).toUpperCase()}
      />

      <View style={styles.middle}>
        {isCitizen && (
          <View style={[styles.pill, { backgroundColor: colors.primaryLight }]}>
            <ShieldUserIcon width={12} height={12} color={colors.primary} />
            <Text style={[styles.pillText, { color: colors.primary }]}>Bürger</Text>
          </View>
        )}
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
      </View>

      <ChevronRightIcon width={20} height={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  middle: {
    flex: 1,
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
  },
});
