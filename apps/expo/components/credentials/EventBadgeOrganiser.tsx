/**
 * Event page, organiser block (spec 5.6b): count line, "Abzeichen-QR zeigen" (full-screen Smart
 * Event QR) and the primary button ("Abzeichen vergeben (<n>)" → approve screen). Rendered only
 * for owners/admins of the event's org with the credential gate open; one signed read on mount.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchEventBadge } from '@/lib/credreg/api';
import { organiserBadgeView, ORGANISER_LABELS } from '@/lib/credreg/event-page';
import { issueEventBadge } from '@/lib/credreg/org';
import type { EventBadgeGetResult } from '@/lib/credreg/types';

export default function EventBadgeOrganiser({ eventId, orgAccountId }: { eventId: string; orgAccountId: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const focused = useIsFocused();
  const account = useActiveAccount();
  const [g, setG] = useState<EventBadgeGetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const address = account?.address;

  // Reload on focus, so the count is fresh after the approve screen or the QR screen.
  useEffect(() => {
    const signer = account;
    if (!focused || !signer) return;
    let alive = true;
    void fetchEventBadge(signer, eventId).then((r) => {
      if (alive && r.ok) setG(r.data);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the account object changes identity on re-render; the address is what matters
  }, [focused, address, eventId]);

  const onPrimary = useCallback(async () => {
    const signer = account;
    if (!signer) return;
    setBusy(true);
    try {
      const r = await issueEventBadge(signer, { eventId, orgAccountId }, { navigate: (route) => router.push(route as never) });
      if (!r.ok) Alert.alert('Abzeichen', r.message);
    } finally {
      setBusy(false);
    }
  }, [account, eventId, orgAccountId, router]);

  if (!g) return null;
  const v = organiserBadgeView(g);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]}>{ORGANISER_LABELS.heading}</Text>
      {g.badge ? <Text style={[styles.name, { color: colors.text }]}>{g.badge.name}</Text> : null}
      <Text style={[styles.count, { color: colors.textSecondary }]}>{v.count}</Text>
      {g.badge ? (
        <Pressable
          onPress={() => router.push({ pathname: '/event/[id]/badge-qr' as never, params: { id: eventId } } as never)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, { borderColor: colors.primary }, pressed && styles.pressed]}
        >
          <Text style={[styles.secondaryText, { color: colors.primary }]}>{ORGANISER_LABELS.showQr}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPrimary}
        disabled={v.primary.disabled || busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: v.primary.disabled ? colors.border : colors.primary },
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={[styles.primaryText, { color: v.primary.disabled ? colors.textSecondary : colors.onPrimary }]}>{v.primary.label}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  heading: { fontSize: 16, fontFamily: fontFamily.heading },
  name: { fontSize: 15, fontFamily: fontFamily.semiBold },
  count: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
  secondary: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  secondaryText: { fontSize: 15, fontFamily: fontFamily.semiBold },
  primary: { borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  primaryText: { fontSize: 15, fontFamily: fontFamily.semiBold },
  pressed: { opacity: 0.85 },
});
