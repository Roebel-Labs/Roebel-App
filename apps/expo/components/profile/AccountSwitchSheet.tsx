import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { SUB_TYPE_EMOJI, SUB_TYPE_LABELS, type Account } from '@/lib/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  activeAccountId: string | null;
  personalAvatarUrl: string | null;
  personalName: string | null;
  onSelect: (accountId: string) => void;
  onLogout: () => void;
};

export default function AccountSwitchSheet({
  visible,
  onClose,
  accounts,
  activeAccountId,
  personalAvatarUrl,
  personalName,
  onSelect,
  onLogout,
}: Props) {
  const { colors } = useTheme();
  // Stable select handler so memoised rows skip re-rendering even when the
  // host passes a fresh inline arrow each render.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const handleSelect = useCallback((id: string) => onSelectRef.current(id), []);

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.7}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Account wechseln</Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {accounts.map((acc) => (
          <AccountRow
            key={acc.id}
            account={acc}
            isActive={acc.id === activeAccountId}
            personalAvatarUrl={personalAvatarUrl}
            personalName={personalName}
            onSelect={handleSelect}
          />
        ))}
      </ScrollView>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Pressable onPress={onLogout} style={styles.logout} accessibilityRole="button" accessibilityLabel="Ausloggen">
        <Text style={[styles.logoutText, { color: colors.error }]}>Ausloggen</Text>
      </Pressable>
    </BottomDrawer>
  );
}

/*
 * One row. Memoised + cached expo-image avatars: the sheet re-renders on every
 * open, and RN's Image re-decoded each avatar during the slide-in animation.
 */
const AccountRow = memo(function AccountRow({
  account: acc,
  isActive,
  personalAvatarUrl,
  personalName,
  onSelect,
}: {
  account: Account;
  isActive: boolean;
  personalAvatarUrl: string | null;
  personalName: string | null;
  onSelect: (accountId: string) => void;
}) {
  const { colors } = useTheme();
  const isPersonal = acc.account_type === 'personal';
  const emoji = isPersonal ? '👤' : (acc.sub_type && SUB_TYPE_EMOJI[acc.sub_type]) || '🏢';
  const typeLabel = isPersonal ? 'Persönlich' : (acc.sub_type && SUB_TYPE_LABELS[acc.sub_type]) || 'Organisation';
  const avatar = isPersonal ? personalAvatarUrl : acc.avatar_url || acc.cover_url;
  const name = isPersonal ? personalName || acc.name : acc.name;
  const pending = !isPersonal && !acc.is_verified;
  const handlePress = useCallback(() => onSelect(acc.id), [onSelect, acc.id]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${typeLabel}`}
      accessibilityState={{ selected: isActive }}
      style={[
        styles.row,
        { borderColor: isActive ? colors.primary : colors.border },
        isActive && { backgroundColor: colors.primaryLight },
      ]}
    >
      {avatar ? (
        <Image
          source={{ uri: avatar }}
          style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={avatar}
        />
      ) : (
        <View style={[styles.avatar, styles.emojiWrap, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.type, { color: colors.textSecondary }]}>{typeLabel}</Text>
      </View>
      {pending && (
        <View style={[styles.statusPill, { backgroundColor: colors.warningBackground }]}>
          <Text style={[styles.statusText, { color: colors.warning }]}>In Prüfung</Text>
        </View>
      )}
      {isActive && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: 'MonaSans-SemiBold', marginBottom: 16 },
  list: { flex: 1 },
  listContent: { paddingBottom: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  emojiWrap: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: 'MonaSans-SemiBold' },
  type: { fontSize: 13, fontFamily: 'MonaSans-Regular' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontFamily: 'MonaSans-Medium' },
  check: { fontSize: 18, fontFamily: 'MonaSans-SemiBold' },
  divider: { height: 1, marginVertical: 12 },
  logout: { paddingVertical: 14, alignItems: 'center' },
  logoutText: { fontSize: 15, fontFamily: 'MonaSans-Medium' },
});
