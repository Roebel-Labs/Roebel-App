import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import AvatarStack from '@/components/AvatarStack';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';
import BadgeCheckIcon from '@/assets/icons/badge-check.svg';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import { VERIFIED_GOLD } from './IdentityRow';
import type { MemberPreviewUser } from '@/hooks/useOrgMemberPreview';

type Props = {
  name: string;
  avatarUrl: string | null;
  emoji: string;
  verified: boolean;
  members: MemberPreviewUser[];
  memberCount: number;
  onMembers: () => void;
};

/** Org avatar + name on the left, the "Mitglieder ›" pill with member avatars on the right. */
export default function OrgIdentityRow({ name, avatarUrl, emoji, verified, members, memberCount, onMembers }: Props) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.emojiWrap, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          )}
          {verified && (
            <View style={[styles.badge, { backgroundColor: colors.background }]}>
              <BadgeCheckIcon width={16} height={16} color={VERIFIED_GOLD} />
            </View>
          )}
        </View>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
      </View>

      <PressableScale
        onPress={onMembers}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={`Mitglieder verwalten, ${memberCount}`}
        style={[styles.pill, { backgroundColor: colors.background, borderColor: colors.border }, softShadow(1, isDark)]}
      >
        {members.length > 0 && <AvatarStack users={members} maxVisible={2} size="small" />}
        <Text style={[styles.pillText, { color: colors.textPrimary }]}>Mitglieder</Text>
        <ChevronRightIcon width={16} height={16} color={colors.textSecondary} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatarWrap: { width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  emojiWrap: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
