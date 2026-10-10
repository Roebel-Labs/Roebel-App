import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { fetchFollowers, type FollowerRow } from '@/lib/account-relations';
import { fetchFollowStats } from '@/lib/supabase-follows';

const PAGE = 50;

type DrawerProps = { visible: boolean; onClose: () => void; accountId: string };

/** Follower list (names only, never wallets). Only mount for an account's own owner/admin or the person themselves. */
export function FollowersDrawer({ visible, onClose, accountId }: DrawerProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const signer = useActiveAccount();
  const [rows, setRows] = useState<FollowerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastPage, setLastPage] = useState(0);

  const requestId = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      if (!signer) return;
      const mine = ++requestId.current;
      setLoading(true);
      try {
        const page = await fetchFollowers(signer, accountId, offset);
        if (mine !== requestId.current) return; // closed or superseded
        setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
        setLastPage(page.length);
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    },
    [signer, accountId],
  );

  useEffect(() => {
    if (visible) void load(0);
    else {
      requestId.current++;
      setLoading(false);
      setRows([]);
      setLastPage(0);
    }
  }, [visible, load]);

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.7}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Follower</Text>
      <ScrollView>
        {rows.map((r, i) => {
          const name = r.name || r.username || 'Unbekannt';
          return (
            <Pressable
              key={`${r.username ?? 'n'}-${i}`}
              disabled={!r.username}
              onPress={() => {
                onClose();
                router.push(`/user/${r.username}` as any);
              }}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`Profil von ${name} öffnen`}
            >
              <UserAvatarWithFrame size={40} uri={r.avatar_url} fallbackInitial={name.charAt(0).toUpperCase()} />
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
            </Pressable>
          );
        })}
        {loading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : null}
        {!loading && rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Noch keine Follower.</Text>
        ) : null}
        {!loading && lastPage === PAGE ? (
          <Pressable onPress={() => void load(rows.length)} style={styles.row} accessibilityRole="button">
            <Text style={[styles.more, { color: colors.primary }]}>Mehr laden</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </BottomDrawer>
  );
}

type CountsProps = {
  accountId: string;
  /** Show "· folgt N" (persons). */
  showFollowing?: boolean;
  /** Tapping opens the follower list; true only for own profile / org owners+admins. */
  canOpenList?: boolean;
  /** Change to re-fetch the counts (e.g. the viewer's follow state). */
  refreshKey?: unknown;
};

/** "N Follower" line; plain text unless canOpenList (spec: no public follower lists). */
export function FollowCounts({ accountId, showFollowing = false, canOpenList = false, refreshKey }: CountsProps) {
  const { colors } = useTheme();
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchFollowStats(accountId).then((s) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [accountId, refreshKey]);

  const followers = (
    <Text style={[styles.counts, { color: colors.textSecondary }]}>{stats.followers} Follower</Text>
  );
  return (
    <View style={styles.countsRow}>
      {canOpenList ? (
        <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Follower anzeigen">
          {followers}
        </Pressable>
      ) : (
        followers
      )}
      {showFollowing ? (
        <Text style={[styles.counts, { color: colors.textSecondary }]}> · folgt {stats.following}</Text>
      ) : null}
      {canOpenList ? <FollowersDrawer visible={open} onClose={() => setOpen(false)} accountId={accountId} /> : null}
    </View>
  );
}

export default FollowersDrawer;

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: 'Inter-SemiBold', paddingHorizontal: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  name: { flex: 1, fontSize: 15, fontFamily: 'Inter-Medium' },
  pad: { padding: 16 },
  empty: { fontSize: 14, fontFamily: 'Inter-Regular', paddingHorizontal: 20, paddingVertical: 16 },
  more: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  countsRow: { flexDirection: 'row', alignItems: 'center' },
  counts: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
