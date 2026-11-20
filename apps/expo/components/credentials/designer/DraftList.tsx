/**
 * The org's card designs (drafts and published ones with their working draft), each with its
 * state: "Entwurf", "Änderungen nicht veröffentlicht", "Wartet auf Bestätigung". Tapping opens
 * the designer. Used on "Mitglieder & Ausweise" and as the designer's start.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { designErrorMessage, fetchDrafts, type DraftView } from '@/lib/credreg/designs';
import type { SigningAccount } from '@/lib/signed-request';

export function draftBadge(d: Pick<DraftView, 'liveVersion' | 'pendingVersion' | 'hasUnpublishedChanges'>): string | null {
  if (d.pendingVersion !== null) return 'Wartet auf Bestätigung';
  if (d.liveVersion === null) return 'Entwurf';
  if (d.hasUnpublishedChanges) return 'Änderungen nicht veröffentlicht';
  return null;
}

export default function DraftList({ account, accountId, showNew = true }: { account: SigningAccount; accountId: string; showNew?: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [drafts, setDrafts] = useState<DraftView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => { setReload((k) => k + 1); }, []));

  // Loads on every focus (the first focus is the first load).
  useEffect(() => {
    if (reload === 0) return;
    let alive = true;
    fetchDrafts(account, accountId).then((res) => {
      if (!alive) return;
      if (res.ok) { setDrafts(res.data); setError(null); } else setError(designErrorMessage(res));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.address, accountId, reload]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Ausweis-Gestaltung</Text>
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      {!drafts && !error ? <ActivityIndicator color={colors.primary} /> : null}
      {drafts?.map((d) => {
        const badge = draftBadge(d);
        return (
          <Pressable
            key={d.id}
            onPress={() => router.push(`/org/credentials/designer?draft=${d.id}` as any)}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={badge ? `${d.name}, ${badge}` : d.name}
          >
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{d.name}</Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {drafts && drafts.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>Noch keine Ausweise gestaltet.</Text>
      ) : null}
      {showNew ? (
        <Pressable
          onPress={() => router.push('/org/credentials/designer?new=1' as any)}
          style={[styles.primary, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Neuer Ausweis"
        >
          <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Neuer Ausweis</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  heading: { fontSize: 17, fontFamily: fontFamily.heading },
  error: { fontSize: 14, fontFamily: fontFamily.medium },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  name: { flex: 1, fontSize: 15, fontFamily: fontFamily.semiBold },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontFamily: fontFamily.semiBold },
  empty: { fontSize: 14, fontFamily: fontFamily.regular },
  primary: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
});
