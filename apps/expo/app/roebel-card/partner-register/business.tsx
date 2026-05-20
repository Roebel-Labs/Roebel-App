// Step 1 — Business picker.
// Lets the user choose which organisation account to register as a Röbel
// Card partner. Auto-advances when the user owns exactly one org.

import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { usePartnerRegisterWizard } from '@/context/PartnerRegisterWizardContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';
import type { Account } from '@/lib/types';

const SUB_TYPE_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  unternehmen: '🏪',
  verein: '🤝',
  stadt: '🏛️',
  fraktion: '⚖️',
};

export default function BusinessPickerScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { ownedAccounts, activeAccount: ctxAccount } = useAccount();
  const { state, dispatch } = usePartnerRegisterWizard();

  const orgAccounts = useMemo(
    () => ownedAccounts.filter((a) => a.account_type === 'organisation'),
    [ownedAccounts],
  );

  // Auto-advance: if the active account is an org, pre-select it and skip
  // this screen entirely. Falls back to the single-org auto-advance if
  // the active account isn't an org but there's only one org owned.
  useEffect(() => {
    if (state.selectedAccountId) return;

    const activeOrg = orgAccounts.find((a) => a.id === ctxAccount?.id);
    const target = activeOrg ?? (orgAccounts.length === 1 ? orgAccounts[0] : null);

    if (target) {
      dispatch({
        type: 'SELECT_ACCOUNT',
        payload: { accountId: target.id, accountName: target.name },
      });
      const timer = setTimeout(() => {
        router.replace('/roebel-card/partner-register/info' as any);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [orgAccounts, ctxAccount, state.selectedAccountId, dispatch, router]);

  // Empty state — user has no org accounts at all.
  if (orgAccounts.length === 0) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyEmoji}>🏪</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Du brauchst zuerst einen Unternehmensaccount
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Lege dein Unternehmen an, um dich als Röbel Card Partner zu registrieren.
          </Text>
          <Pressable
            onPress={() => router.replace('/create-org' as any)}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              Unternehmen anlegen
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Single org — render a loader while the effect auto-advances.
  if (orgAccounts.length === 1) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Multiple orgs — show a selectable list.
  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <StoryProgress step={1} totalSteps={5} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Welcher Betrieb?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Wähle das Unternehmen aus, das du als Röbel Card Partner registrieren möchtest.
        </Text>

        <View style={styles.list}>
          {orgAccounts.map((account) => (
            <OrgRow
              key={account.id}
              account={account}
              selected={state.selectedAccountId === account.id}
              onPress={() =>
                dispatch({
                  type: 'SELECT_ACCOUNT',
                  payload: { accountId: account.id, accountName: account.name },
                })
              }
              colors={colors}
            />
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={() => router.push('/roebel-card/partner-register/info' as any)}
        nextDisabled={!state.selectedAccountId}
      />
    </SafeAreaView>
  );
}

function OrgRow({
  account,
  selected,
  onPress,
  colors,
}: {
  account: Account;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const emoji = account.sub_type ? SUB_TYPE_EMOJI[account.sub_type] || '🏢' : '🏢';
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
          backgroundColor: colors.surface,
        },
      ]}
    >
      {account.avatar_url ? (
        <Image source={{ uri: account.avatar_url }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
          <Text style={styles.avatarEmoji}>{emoji}</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {account.name}
        </Text>
        {account.sub_type && (
          <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
            {emoji} {capitalise(account.sub_type)}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : 'transparent',
          },
        ]}
      />
    </Pressable>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  title: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 32 },
  list: { gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 22 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  rowSub: { fontSize: 12, fontFamily: 'Inter-Regular' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  bottomSpacer: { height: 96 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyEmoji: { fontSize: 56, marginBottom: 8 },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
