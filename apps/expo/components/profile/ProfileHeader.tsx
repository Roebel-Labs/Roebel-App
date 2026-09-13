import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AvatarStack from '@/components/AvatarStack';
import GlassPill from '@/components/GlassPill';
import { useTheme } from '@/context/ThemeContext';
import type { Account } from '@/lib/types';

type Props = {
  title: string;
  switcherVisible: boolean;
  recentOtherAccounts: Account[];
  personalAvatarUrl: string | null;
  onSwitch: () => void;
};

/** Screen title plus the frosted "Account wechseln" pill (multi-account users only). */
export default function ProfileHeader({
  title,
  switcherVisible,
  recentOtherAccounts,
  personalAvatarUrl,
  onSwitch,
}: Props) {
  const { colors } = useTheme();
  const stackUsers = recentOtherAccounts.map((a) => ({
    avatar_url: a.account_type === 'personal' ? personalAvatarUrl : a.avatar_url || a.cover_url,
    username: a.name,
  }));

  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      {switcherVisible && (
        <GlassPill onPress={onSwitch} accessibilityLabel="Account wechseln">
          {stackUsers.length > 0 && <AvatarStack users={stackUsers} maxVisible={2} size="small" />}
          <Text style={[styles.pillText, { color: colors.textPrimary }]}>Account wechseln</Text>
        </GlassPill>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
