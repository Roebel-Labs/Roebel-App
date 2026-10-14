// Attester inbox for NSP-14: open org registration requests, approve or reject.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { encodeFunctionData, parseAbi, type Address } from 'viem';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { orgRegistryGnosisAddress } from '@/constants/gnosis';
import { isOrgSafePreviewAllowed } from '@/lib/org-safe/gate';
import { readOpenOrgRequests } from '@/lib/org-safe/chain';
import { fetchOrgRefs } from '@/lib/org-safe/members';
import { orgDirectory, type OrgRequestItem } from '@/lib/org-safe/requests';
import { sendOrgCalls } from '@/lib/org-safe/send';

const voteAbi = parseAbi(['function approveRequest(uint256 requestId)', 'function rejectRequest(uint256 requestId)']);

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('SelfVote')) return 'Du bist Inhaber dieser Organisation und kannst sie nicht selbst bestätigen.';
  if (msg.includes('AlreadyVoted')) return 'Du hast hier bereits abgestimmt.';
  if (msg.includes('Expired') || msg.includes('NotPending')) return 'Die Anfrage ist nicht mehr offen.';
  return 'Transaktion fehlgeschlagen. Bitte versuche es erneut.';
}

export default function OrgRequestsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { gnosisAccount } = useGnosisWallet();
  const { hasAttesterNFT } = useVerificationContext();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [items, setItems] = useState<OrgRequestItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isOrgSafePreviewAllowed().then(setAllowed);
  }, []);

  const load = useCallback(async () => {
    if (!gnosisAccount) return;
    setError(null);
    try {
      const orgs = orgDirectory(await fetchOrgRefs());
      setItems(await readOpenOrgRequests(gnosisAccount.address, orgs));
    } catch (e) {
      console.error('org requests load failed', e);
      setError('Anfragen konnten nicht geladen werden.');
      setItems([]);
    }
  }, [gnosisAccount]);

  useEffect(() => {
    if (allowed && hasAttesterNFT) load();
  }, [allowed, hasAttesterNFT, load]);

  const vote = async (item: OrgRequestItem, approve: boolean) => {
    if (!gnosisAccount) return;
    const key = `${item.requestId}:${approve ? 'a' : 'r'}`;
    setBusy(key);
    setError(null);
    try {
      const data = encodeFunctionData({
        abi: voteAbi,
        functionName: approve ? 'approveRequest' : 'rejectRequest',
        args: [BigInt(item.requestId)],
      });
      await sendOrgCalls(gnosisAccount, [{ to: orgRegistryGnosisAddress as Address, data }]);
      await load();
    } catch (e) {
      console.error('org request vote failed', e);
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  let body: React.ReactNode;
  if (allowed === false || !hasAttesterNFT) {
    body = (
      <Text style={[styles.empty, { color: colors.textSecondary }]}>Nur Attester können Organisationen bestätigen.</Text>
    );
  } else if (items === null) {
    body = <ActivityIndicator color={colors.textSecondary} style={styles.loader} />;
  } else if (items.length === 0) {
    body = <Text style={[styles.empty, { color: colors.textSecondary }]}>Keine offenen Anfragen.</Text>;
  } else {
    body = items.map((item) => {
      const name = item.org?.name ?? 'Unbekannte Organisation';
      const canApprove = !item.voted && !item.selfOwned && !!item.org;
      return (
        <View key={item.requestId} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHead}>
            {item.org?.avatar_url ? (
              <Image source={{ uri: item.org.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]} />
            )}
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {name}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                {item.approvals} von {item.required} Bestätigungen · offen bis{' '}
                {new Date(item.expiresAt * 1000).toLocaleDateString('de-DE')}
              </Text>
            </View>
          </View>

          {!item.org && (
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Diese Anfrage gehört zu keiner Organisation in der App. Nicht bestätigen.
            </Text>
          )}
          {item.voted ? (
            <Text style={[styles.cardMeta, { color: colors.textPrimary }]}>Du hast abgestimmt.</Text>
          ) : (
            <View style={styles.actions}>
              {item.selfOwned ? (
                <Text style={[styles.cardMeta, styles.flex, { color: colors.textSecondary }]}>
                  Du bist Inhaber. Andere Attester entscheiden.
                </Text>
              ) : (
                canApprove && (
                  <Pressable
                    onPress={() => vote(item, true)}
                    disabled={!!busy}
                    style={({ pressed }) => [
                      styles.button,
                      styles.flex,
                      { backgroundColor: colors.primary, opacity: busy || pressed ? 0.7 : 1 },
                    ]}
                  >
                    {busy === `${item.requestId}:a` ? (
                      <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                      <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Bestätigen</Text>
                    )}
                  </Pressable>
                )
              )}
              <Pressable
                onPress={() => vote(item, false)}
                disabled={!!busy}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondary,
                  { borderColor: colors.border, opacity: busy || pressed ? 0.7 : 1 },
                ]}
              >
                {busy === `${item.requestId}:r` ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Ablehnen</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      );
    });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          hitSlop={12}
        >
          <ArrowLeftIcon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>Organisationen bestätigen</Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Neue Organisationen beantragen mit ihrem eigenen Safe die Aufnahme. Bestätige nur Organisationen, die du
          kennst und die es in Röbel wirklich gibt.
        </Text>
        {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 },
  title: { fontSize: 22, fontFamily: 'MonaSansSemiCondensed-Bold' },
  intro: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter-Regular', marginBottom: 4 },
  loader: { marginTop: 32 },
  empty: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 24, textAlign: 'center' },
  error: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  cardMeta: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter-Regular' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  button: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondary: { borderWidth: 1 },
  buttonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
});
