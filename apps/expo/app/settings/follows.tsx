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
import {
  fetchAccountDisplays,
  fetchFollowStats,
  fetchFollowSuggestions,
  fetchPersonalAccountId,
  type FollowSuggestion,
} from '@/lib/supabase-follows';
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
  const [mutedError, setMutedError] = useState(false);
  const [mutedReload, setMutedReload] = useState(0);
  // Followed accounts that get_follow_suggestions does not return (opted out, unnamed, ...).
  const [extraFollowed, setExtraFollowed] = useState<FollowSuggestion[]>([]);
  const [personalId, setPersonalId] = useState<string | null>(null);
  // null = not loaded (or failed): the switch stays disabled instead of showing a fake "off".
  const [suggest, setSuggest] = useState<boolean | null>(null);
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

  // Resolve muted account names (persons by display name / username, never a wallet); owners of
  // personal accounts give the wallet key for unmute. A failed lookup shows a retry, not fake rows.
  const mutedKey = snapshot.muted.join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = snapshot.muted;
    setMutedError(false);
    if (ids.length === 0) { setMuted([]); return; }
    setMuted(null);
    void (async () => {
      try {
        const rows = await fetchAccountDisplays(ids);
        if (cancelled) return;
        const mutedWallets = new Set(snapshot.mutedWallets.map((w) => w.toLowerCase()));
        const byId = new Map(rows.map((r) => [r.account_id, r]));
        setMuted(ids.flatMap((id) => {
          const r = byId.get(id);
          if (!r) return []; // account gone: nothing to show or unmute
          const wallet = r.ownerWallets.find((w) => mutedWallets.has(w)) ?? r.ownerWallets[0] ?? null;
          return [{ id, name: r.name ?? 'Konto', avatar_url: r.avatar_url, wallet }];
        }));
      } catch (err) {
        console.error('muted accounts lookup failed', err);
        if (!cancelled) { setMuted(null); setMutedError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [mutedKey, mutedReload]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Folge ich" must list every followed account, also ones the suggestion RPC leaves out.
  const followingKey = snapshot.following.join(',');
  useEffect(() => {
    let cancelled = false;
    if (suggestions === null) return;
    // Additive: an extra row stays while the screen is open, so an accidental Entfolgen can be undone.
    const known = new Set([...suggestions, ...extraFollowed].map((s) => s.account_id));
    const missing = snapshot.following.filter((id) => !known.has(id) && id !== personalId);
    if (missing.length === 0) return;
    void (async () => {
      try {
        const rows = await fetchAccountDisplays(missing);
        const stats = await Promise.all(rows.map((r) => fetchFollowStats(r.account_id)));
        if (cancelled) return;
        setExtraFollowed((prev) => [...prev.filter((p) => !rows.some((r) => r.account_id === p.account_id)), ...rows.map((r, i) => ({
          account_id: r.account_id,
          name: r.name ?? 'Konto',
          avatar_url: r.avatar_url,
          account_type: r.account_type,
          sub_type: r.sub_type,
          followers: stats[i].followers,
        }))]);
      } catch (err) {
        console.error('followed accounts lookup failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [followingKey, suggestions, personalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The viewer's own personal account never appears in their own list.
  const listed = useMemo(() => {
    if (suggestions === null) return null;
    const extraIds = new Set(extraFollowed.map((e) => e.account_id));
    return [...extraFollowed, ...suggestions.filter((s) => !extraIds.has(s.account_id))]
      .filter((s) => s.account_id !== personalId);
  }, [suggestions, extraFollowed, personalId]);

  const followingSet = useMemo(() => new Set(snapshot.following), [snapshot.following]);
  const unticked = useMemo(
    () => new Set((listed ?? []).filter((s) => !followingSet.has(s.account_id)).map((s) => s.account_id)),
    [listed, followingSet],
  );

  const onToggle = useCallback((id: string) => {
    void (followingSet.has(id) ? unfollow([id]) : follow([id], 'manual'));
  }, [followingSet, follow, unfollow]);
  const onAll = useCallback(() => {
    const ids = (listed ?? []).map((s) => s.account_id).filter((id) => !followingSet.has(id));
    if (ids.length > 0) void follow(ids, 'manual');
  }, [listed, followingSet, follow]);
  const onNone = useCallback(() => {
    const ids = (listed ?? []).map((s) => s.account_id).filter((id) => followingSet.has(id));
    if (ids.length > 0) void unfollow(ids);
  }, [listed, followingSet, unfollow]);

  const onSuggestChange = useCallback(async (value: boolean) => {
    if (!account || !personalId || suggestBusy || suggest === null) return;
    setSuggestBusy(true);
    setSuggest(value);
    const ok = await setSuggestToNewUsers(account as any, personalId, value);
    if (!ok) setSuggest(!value);
    setSuggestBusy(false);
  }, [account, personalId, suggestBusy, suggest]);

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
        {suggest === null ? (
          <ActivityIndicator color={colors.primary} accessibilityLabel="Einstellung wird geladen" />
        ) : (
          <Switch
            value={suggest}
            onValueChange={onSuggestChange}
            disabled={!personalId || suggestBusy}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        )}
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
        listed === null ? (
          <View style={styles.flex}>{segments}<ActivityIndicator color={colors.primary} style={styles.loader} /></View>
        ) : (
          <FollowList
            suggestions={listed}
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
            mutedError ? (
              <View style={styles.errorBox}>
                <Text style={[styles.empty, { color: colors.textSecondary }]}>Die Liste konnte nicht geladen werden.</Text>
                <Pressable onPress={() => setMutedReload((n) => n + 1)} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.action, { color: colors.primary }]}>Erneut versuchen</Text>
                </Pressable>
              </View>
            ) : muted === null ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
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
  errorBox: { alignItems: 'center', gap: 12 },
  empty: { fontFamily: fontFamily.regular, fontSize: 14, textAlign: 'center', marginTop: 32, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  name: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 15 },
  action: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
