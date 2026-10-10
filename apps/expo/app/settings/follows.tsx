/**
 * Settings → Folgen & Stummschalten.
 * "Folge ich": toggle follows immediately; "Stummgeschaltet": list + unmute. Plus the opt-in
 * switch "Neuen Nutzer:innen vorschlagen". Wallet addresses are used only as keys, never rendered.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { useRelations } from '@/context/RelationsContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import FollowList from '@/components/follow/FollowList';
import { supabase } from '@/lib/supabase';
import { fetchFollowSuggestions, fetchPersonalAccountId, type FollowSuggestion } from '@/lib/supabase-follows';
import { fetchSuggestToNewUsers, setSuggestToNewUsers } from '@/lib/supabase-accounts';

type Segment = 'following' | 'muted';
type MutedRow = { id: string; name: string; avatar_url: string | null; wallet: string | null };

export default function FollowsSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { snapshot, follow, unfollow, unmute } = useRelations();

  const [segment, setSegment] = useState<Segment>('following');
  const [suggestions, setSuggestions] = useState<FollowSuggestion[] | null>(null);
  const [muted, setMuted] = useState<MutedRow[] | null>(null);
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchFollowSuggestions().then((s) => { if (!cancelled) setSuggestions(s); });
    return () => { cancelled = true; };
  }, []);

  const wallet = account?.address?.toLowerCase() ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!wallet) return;
    void (async () => {
      const id = await fetchPersonalAccountId(wallet);
      if (cancelled || !id) return;
      setPersonalId(id);
      const v = await fetchSuggestToNewUsers(id);
      if (!cancelled) setSuggest(v);
    })();
    return () => { cancelled = true; };
  }, [wallet]);

  // Resolve muted account names; owners of personal accounts give the wallet key for unmute.
  const mutedKey = snapshot.muted.join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = snapshot.muted;
    if (ids.length === 0) { setMuted([]); return; }
    void (async () => {
      const { data: accs } = await (supabase as any)
        .from('accounts').select('id,name,avatar_url,account_type').in('id', ids);
      const rows = (accs ?? []) as { id: string; name: string; avatar_url: string | null; account_type: string }[];
      const personalIds = rows.filter((r) => r.account_type === 'personal').map((r) => r.id);
      const walletById = new Map<string, string>();
      if (personalIds.length > 0) {
        const { data: owners } = await (supabase as any)
          .from('account_owners').select('account_id,wallet_address').in('account_id', personalIds);
        const mutedWallets = new Set(snapshot.mutedWallets.map((w) => w.toLowerCase()));
        for (const o of (owners ?? []) as { account_id: string; wallet_address: string }[]) {
          const w = o.wallet_address.toLowerCase();
          if (mutedWallets.has(w) || !walletById.has(o.account_id)) walletById.set(o.account_id, w);
        }
      }
      if (cancelled) return;
      const byId = new Map(rows.map((r) => [r.id, r]));
      setMuted(ids.map((id) => {
        const r = byId.get(id);
        return { id, name: r?.name ?? 'Unbekannt', avatar_url: r?.avatar_url ?? null, wallet: walletById.get(id) ?? null };
      }));
    })();
    return () => { cancelled = true; };
  }, [mutedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const followingSet = useMemo(() => new Set(snapshot.following), [snapshot.following]);
  const unticked = useMemo(
    () => new Set((suggestions ?? []).filter((s) => !followingSet.has(s.account_id)).map((s) => s.account_id)),
    [suggestions, followingSet],
  );

  const onToggle = useCallback((id: string) => {
    void (followingSet.has(id) ? unfollow([id]) : follow([id], 'manual'));
  }, [followingSet, follow, unfollow]);
  const onAll = useCallback(() => {
    const ids = (suggestions ?? []).map((s) => s.account_id).filter((id) => !followingSet.has(id));
    if (ids.length > 0) void follow(ids, 'manual');
  }, [suggestions, followingSet, follow]);
  const onNone = useCallback(() => {
    const ids = (suggestions ?? []).map((s) => s.account_id).filter((id) => followingSet.has(id));
    if (ids.length > 0) void unfollow(ids);
  }, [suggestions, followingSet, unfollow]);

  const onSuggestChange = useCallback(async (value: boolean) => {
    if (!account || !personalId || suggestBusy) return;
    setSuggestBusy(true);
    setSuggest(value);
    const ok = await setSuggestToNewUsers(account as any, personalId, value);
    if (!ok) setSuggest(!value);
    setSuggestBusy(false);
  }, [account, personalId, suggestBusy]);

  const segments = (
    <View>
      <View style={[styles.segments, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {([['following', 'Folge ich'], ['muted', 'Stummgeschaltet']] as const).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setSegment(key)}
            style={[styles.segment, segment === key && { backgroundColor: colors.primary }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === key }}
          >
            <Text style={[styles.segmentText, { color: segment === key ? '#fff' : colors.textPrimary }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.toggleRow, { borderColor: colors.borderSecondary }]}>
        <View style={styles.toggleText}>
          <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Neuen Nutzer:innen vorschlagen</Text>
          <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
            Dein Profil erscheint in der Liste, die neue Röbeler:innen beim Start sehen.
          </Text>
        </View>
        <Switch
          value={suggest}
          onValueChange={onSuggestChange}
          disabled={!personalId || suggestBusy}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Folgen & Stummschalten</Text>
        <View style={styles.headerSpacer} />
      </View>

      {segment === 'following' ? (
        suggestions === null ? (
          <View style={styles.flex}>{segments}<ActivityIndicator color={colors.primary} style={styles.loader} /></View>
        ) : (
          <FollowList
            suggestions={suggestions}
            unticked={unticked}
            onToggle={onToggle}
            onAll={onAll}
            onNone={onNone}
            header={segments}
          />
        )
      ) : (
        <FlatList
          data={muted ?? []}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={segments}
          ListEmptyComponent={
            muted === null ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>Du hast niemanden stummgeschaltet.</Text>
            )
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textSecondary }}>{item.name.trim().charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
              <Pressable onPress={() => { void unmute(item.id, item.wallet); }} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.action, { color: colors.primary }]}>Aufheben</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  headerSpacer: { width: 24 },
  segments: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderRadius: 10, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  toggleText: { flex: 1 },
  toggleLabel: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  toggleHint: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 2 },
  loader: { marginTop: 32 },
  empty: { fontFamily: fontFamily.regular, fontSize: 14, textAlign: 'center', marginTop: 32, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  name: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 15 },
  action: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
