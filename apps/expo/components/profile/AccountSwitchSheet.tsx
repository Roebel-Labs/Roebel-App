import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.7}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Account wechseln</Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {accounts.map((acc) => {
          const isPersonal = acc.account_type === 'personal';
          const isActive = acc.id === activeAccountId;
          const emoji = isPersonal ? '👤' : (acc.sub_type && SUB_TYPE_EMOJI[acc.sub_type]) || '🏢';
          const typeLabel = isPersonal ? 'Persönlich' : (acc.sub_type && SUB_TYPE_LABELS[acc.sub_type]) || 'Organisation';
          const avatar = isPersonal ? personalAvatarUrl : acc.avatar_url || acc.cover_url;
          const name = isPersonal ? personalName || acc.name : acc.name;
          const pending = !isPersonal && !acc.is_verified;

          return (
            <Pressable
              key={acc.id}
              onPress={() => onSelect(acc.id)}
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
                <Image source={{ uri: avatar }} style={styles.avatar} />
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
        })}
      </ScrollView>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Pressable onPress={onLogout} style={styles.logout} accessibilityRole="button" accessibilityLabel="Ausloggen">
        <Text style={[styles.logoutText, { color: colors.error }]}>Ausloggen</Text>
      </Pressable>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginBottom: 16 },
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
  name: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  type: { fontSize: 13, fontFamily: 'Inter-Regular' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  check: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  divider: { height: 1, marginVertical: 12 },
  logout: { paddingVertical: 14, alignItems: 'center' },
  logoutText: { fontSize: 15, fontFamily: 'Inter-Medium' },
});
