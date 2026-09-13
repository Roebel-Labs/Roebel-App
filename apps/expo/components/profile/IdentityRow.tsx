import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { useTheme } from '@/context/ThemeContext';
import BadgeCheckIcon from '@/assets/icons/badge-check.svg';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';

type Props = {
  name: string;
  avatarUrl: string | null;
  /** Citizens and attesters get the gold check on the avatar. */
  verified: boolean;
  onPress: () => void;
  /** Right slot, e.g. the Münzen button. */
  right?: React.ReactNode;
};

export const VERIFIED_GOLD = '#E5A800';

/** Avatar, name and "Zum Profil ›" on the left; an optional action on the right. */
export default function IdentityRow({ name, avatarUrl, verified, onPress, right }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.left, { opacity: pressed ? 0.7 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Profil von ${name} öffnen`}
      >
        <View style={styles.avatarWrap}>
          <UserAvatarWithFrame size={48} uri={avatarUrl} fallbackInitial={(name || '?').charAt(0).toUpperCase()} />
          {verified && (
            <View style={[styles.badge, { backgroundColor: colors.background }]}>
              <BadgeCheckIcon width={16} height={16} color={VERIFIED_GOLD} />
            </View>
          )}
        </View>
        <View style={styles.texts}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.subRow}>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>Zum Profil</Text>
            <ChevronRightIcon width={14} height={14} color={colors.textSecondary} />
          </View>
        </View>
      </Pressable>
      {right ? <View style={styles.right}>{right}</View> : null}
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
  avatarWrap: {
    width: 48,
    height: 48,
  },
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
  texts: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sub: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  right: {
    flexShrink: 0,
  },
});
