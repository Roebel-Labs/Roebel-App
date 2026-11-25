/**
 * "Abzeichen" for the active organisation: its event badges first (picture, event, how many
 * collected, how many entered in the register); a badge opens its event, where the organiser block
 * has the door QR, the live count and "Abzeichen vergeben". Below: designing own badges with AI is
 * coming soon, event badges already work.
 *
 * The list uses event_badges_list, which needs owner/admin in the database only, so draft badges of
 * an org that is not registered on chain yet show up as well.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fontFamily } from '@/constants/theme';
import PressableScale from '@/components/PressableScale';
import { CredentialScreenFrame } from '@/components/credentials/CredentialScreenFrame';
import { credApi } from '@/lib/credreg/api';
import { formatEventDate } from '@/lib/credreg/collect-format';
import type { EventBadgeGetResult } from '@/lib/credreg/types';

const ILLUSTRATION = require('@/assets/illustration/badges/badge_cards.webp');

type OrgBadgeRow = {
  eventId: string;
  title: string;
  date: string;
  badge: NonNullable<EventBadgeGetResult['badge']> | null;
  attendees: number;
  issued: number;
  accepted: number;
};

function countLine(r: OrgBadgeRow): string {
  const collected = `${r.attendees} gesammelt`;
  if (r.badge?.chain !== 'onchain') return `${collected} · wird eingetragen, sobald eure Organisation bestätigt ist`;
  return `${collected} · ${r.issued} eingetragen`;
}

export default function OrgBadgesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const isOrg = activeAccount?.account_type === 'organisation';
  const canManage = isOrg && (roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin');
  const accountId = isOrg ? activeAccount?.id ?? null : null;
  const [rows, setRows] = useState<OrgBadgeRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (account && accountId && canManage) {
        credApi<OrgBadgeRow[]>(account, 'org', 'event_badges_list', { accountId }).then((r) => {
          if (!alive) return;
          if (r.ok) {
            setRows(r.data.filter((x) => x.badge).sort((a, b) => (a.date < b.date ? 1 : -1)));
            setFailed(false);
          } else {
            setFailed(true);
          }
        });
      }
      return () => {
        alive = false;
      };
      // the account object changes identity on re-render; the address is what matters
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account?.address, accountId, canManage]),
  );

  return (
    <CredentialScreenFrame title="Abzeichen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {canManage ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Eure Abzeichen</Text>
            {rows === null && !failed ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : failed ? (
              <Text style={[styles.muted, { color: colors.textSecondary }]}>Abzeichen konnten nicht geladen werden.</Text>
            ) : rows && rows.length === 0 ? (
              <Text style={[styles.muted, { color: colors.textSecondary }]}>Noch keine Abzeichen. Schaltet bei einer Veranstaltung „Abzeichen für Teilnehmende“ ein.</Text>
            ) : (
              rows?.map((r) => (
                <Pressable
                  key={r.eventId}
                  onPress={() => router.push({ pathname: '/event/[id]', params: { id: r.eventId } } as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.badge?.name ?? r.title}, ${countLine(r)}. QR-Code und Vergeben auf der Veranstaltung`}
                  style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                >
                  <View style={[styles.thumb, { backgroundColor: colors.surface }]}>
                    {r.badge?.imageUrl ? <Image source={{ uri: r.badge.imageUrl }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
                  </View>
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.textPrimary }]}>
                      {r.badge?.name ?? r.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.rowSub, { color: colors.textSecondary }]}>
                      {r.title} · {formatEventDate(r.date)}
                    </Text>
                    <Text style={[styles.rowCount, { color: colors.primary }]}>{countLine(r)}</Text>
                    <Text style={[styles.rowHint, { color: colors.textSecondary }]}>QR-Code & Vergeben ›</Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        <View style={[styles.soon, { borderColor: colors.border }]}>
          <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" accessible={false} />
          <View style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.chipText, { color: colors.primary }]}>Bald verfügbar</Text>
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Eigene Abzeichen gestalten</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Bald gestaltet ihr hier mit KI eigene Abzeichen für eure Veranstaltungen, Mitglieder und Ehrenamtliche, im Stil der
            Röbel-Abzeichen.
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginTop: 10 }]}>
            Schon jetzt: Schaltet beim Anlegen oder Bearbeiten einer Veranstaltung „Abzeichen für Teilnehmende“ ein. Gäste scannen den
            QR-Code am Eingang und bekommen das Abzeichen in ihre Sammlung.
          </Text>
          <PressableScale
            onPress={() => router.push('/submit-event' as any)}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel="Veranstaltung anlegen"
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Veranstaltung anlegen</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 24 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 26 },
  loader: { marginVertical: 16 },
  muted: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 14, borderWidth: 1, borderRadius: 16, padding: 12, alignItems: 'center' },
  thumb: { width: 64, height: 90, borderRadius: 10, overflow: 'hidden' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  rowSub: { fontFamily: fontFamily.regular, fontSize: 13 },
  rowCount: { fontFamily: fontFamily.semiBold, fontSize: 13, marginTop: 4 },
  rowHint: { fontFamily: fontFamily.medium, fontSize: 12, marginTop: 2 },
  soon: { borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center' },
  illustration: { width: 200, height: 152, marginBottom: 14 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  title: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 26, textAlign: 'center', marginBottom: 6 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: { alignSelf: 'stretch', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});
