import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import BottomDrawer from '@/components/BottomDrawer';
import { SUB_TYPE_EMOJI, SUB_TYPE_LABELS } from '@/lib/types';
import type { Account } from '@/lib/types';

function emojiFor(acc: Account): string {
  if (acc.account_type === 'personal') return '👤';
  return (acc.sub_type && SUB_TYPE_EMOJI[acc.sub_type]) || '🏢';
}

function labelFor(acc: Account): string {
  if (acc.account_type === 'personal') return 'Persönlich';
  return (acc.sub_type && SUB_TYPE_LABELS[acc.sub_type]) || 'Organisation';
}

export default function AccountChip() {
  const { colors } = useTheme();
  const { activeAccount, ownedAccounts, switchAccount } = useAccount();
  const [open, setOpen] = useState(false);

  if (!activeAccount || ownedAccounts.length === 0) return null;

  const onlyOne = ownedAccounts.length === 1;

  return (
    <>
      <Pressable
        onPress={() => !onlyOne && setOpen(true)}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && !onlyOne && { opacity: 0.7 },
        ]}
        hitSlop={6}
      >
        {activeAccount.avatar_url ? (
          <Image source={{ uri: activeAccount.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.avatarEmoji}>{emojiFor(activeAccount)}</Text>
          </View>
        )}
        <Text
          style={[styles.name, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {activeAccount.name}
        </Text>
        {!onlyOne && (
          <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
        )}
      </Pressable>

      <BottomDrawer visible={open} onClose={() => setOpen(false)} snapPoint={0.55}>
        <Text style={[sheetStyles.title, { color: colors.textPrimary }]}>
          Postfach wechseln
        </Text>
        <Text style={[sheetStyles.subtitle, { color: colors.textSecondary }]}>
          Nachrichten und Antworten sind pro Konto getrennt.
        </Text>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {ownedAccounts.map((acc) => {
            const isActive = activeAccount.id === acc.id;
            return (
              <Pressable
                key={acc.id}
                onPress={() => {
                  setOpen(false);
                  if (!isActive) void switchAccount(acc.id);
                }}
                style={[
                  sheetStyles.row,
                  {
                    borderColor: isActive ? colors.primary : colors.border,
                    backgroundColor: isActive ? colors.primaryLight : 'transparent',
                  },
                ]}
              >
                {acc.avatar_url ? (
                  <Image source={{ uri: acc.avatar_url }} style={sheetStyles.rowAvatar} />
                ) : (
                  <View style={[sheetStyles.rowIcon, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={sheetStyles.rowEmoji}>{emojiFor(acc)}</Text>
                  </View>
                )}
                <View style={sheetStyles.rowInfo}>
                  <Text
                    style={[sheetStyles.rowName, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {acc.name}
                  </Text>
                  <Text style={[sheetStyles.rowType, { color: colors.textSecondary }]}>
                    {labelFor(acc)}
                  </Text>
                </View>
                {isActive && (
                  <Text style={[sheetStyles.check, { color: colors.primary }]}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomDrawer>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 160,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  avatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 12,
  },
  name: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    flexShrink: 1,
  },
  chevron: {
    fontSize: 14,
    transform: [{ rotate: '90deg' }],
    marginLeft: -2,
  },
});

const sheetStyles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: {
    fontSize: 20,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  rowType: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  check: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
});
