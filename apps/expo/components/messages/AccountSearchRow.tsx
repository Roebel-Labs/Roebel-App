import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import CheckIcon from '@/assets/icons/check.svg';
import { SUB_TYPE_LABELS, SUB_TYPE_EMOJI } from '@/lib/types';
import { safeDisplayName } from '@/lib/supabase-messages';
import type { AccountSearchResult } from '@/lib/supabase-account-search';

type Props = {
  result: AccountSearchResult;
  onPress: () => void;
  index?: number;
};

export default function AccountSearchRow({ result, onPress, index = 0 }: Props) {
  const { colors } = useTheme();

  const displayName = safeDisplayName(result.name, result.username);

  const subtitle = (() => {
    if (result.accountType === 'organisation' && result.subType) {
      return `${SUB_TYPE_EMOJI[result.subType]} ${SUB_TYPE_LABELS[result.subType]}`;
    }
    if (result.accountType === 'personal' && result.username) {
      return `@${result.username}`;
    }
    if (result.slug) return `@${result.slug}`;
    return null;
  })();

  return (
    <Animated.View entering={FadeIn.duration(180).delay(Math.min(index, 6) * 24)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border },
          pressed && { backgroundColor: colors.pressedOverlay },
        ]}
      >
        <UserAvatarWithFrame
          size={44}
          uri={result.avatarUrl}
          fallbackInitial={(displayName[0] || '?').toUpperCase()}
          frameAssetUrl={null}
        />
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.name, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {result.isVerified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.primary }]}>
                <CheckIcon width={10} height={10} color={colors.onPrimary} />
              </View>
            )}
          </View>
          {subtitle && (
            <Text
              style={[styles.subtitle, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    flexShrink: 1,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
});
