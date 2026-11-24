import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';
import { isOrgSafePreviewAllowed } from '@/lib/org-safe/gate';
import { readOpenOrgRequests } from '@/lib/org-safe/chain';
import { fetchOrgRefs } from '@/lib/org-safe/members';
import { orgDirectory, type OrgRequestItem } from '@/lib/org-safe/requests';

/**
 * "Für Bescheiniger:innen": tasks waiting for this attester's vote. Today: org registrations
 * (NSP-14) not voted on yet; later event submissions and transfers join the same card.
 * Renders nothing while there is nothing to do.
 */
export default function AttesterTasksCard() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { gnosisAccount } = useGnosisWallet();
  const [orgRequests, setOrgRequests] = useState<OrgRequestItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const address = gnosisAccount?.address;
      if (!address) return;
      (async () => {
        try {
          if (!(await isOrgSafePreviewAllowed())) return;
          const items = await readOpenOrgRequests(address, orgDirectory(await fetchOrgRefs()));
          if (alive) setOrgRequests(items.filter((i) => !i.voted && i.org));
        } catch {
          // chain read failed: keep the last state, the inbox shows errors itself
        }
      })();
      return () => {
        alive = false;
      };
    }, [gnosisAccount?.address]),
  );

  if (orgRequests.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.background }, softShadow(2, isDark)]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Organisation bestätigen</Text>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        Als Bescheiniger:in prüfst du, ob diese Organisation ins öffentliche Register darf.
      </Text>
      {orgRequests.map((r, i) => (
        <Pressable
          key={r.requestId}
          onPress={() => router.push('/verification/orgs' as any)}
          accessibilityRole="button"
          accessibilityLabel={`${r.org?.name ?? 'Organisation'} prüfen`}
          style={({ pressed }) => [
            styles.row,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.textPrimary }]}>
              {r.org?.name ?? 'Organisation'}
            </Text>
            <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
              {r.approvals} von {r.required} Bestätigungen
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginTop: 16 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 18, lineHeight: 24 },
  lead: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20 },
  rowSubtitle: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  chevron: { fontFamily: fontFamily.regular, fontSize: 24, lineHeight: 26 },
});
