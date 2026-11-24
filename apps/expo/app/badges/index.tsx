/**
 * "Abzeichen": the person's badge collection (Figma 3138:3042). Collected and pending badges first,
 * then dashed empty slots with a badge icon, so the screen reads as a collection to fill.
 * Tapping a badge opens the same detail sheet as on Profil.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useIsCitizen } from '@/hooks/useIsCitizen';
import { useProfileCredentials } from '@/hooks/useProfileCredentials';
import { useHolder } from '@/lib/card-design/holder-values';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame } from '@/components/credentials/CredentialScreenFrame';
import CredentialDetailSheet from '@/components/profile/CredentialDetailSheet';
import { groupBadgesByYear, type BadgeTile, type RegisterCard } from '@/lib/credreg/model';
import { formatEventDate } from '@/lib/credreg/collect-format';
import { shareRoute } from '@/lib/credreg/collect';
import { makePrivate } from '@/lib/credreg/visibility';
import { makePublic } from '@/lib/credreg/accept';

const COLUMNS = 3;
const GAP = 12;
const INSET = 20;
/** Slot shape of the Figma placeholders (205 × 310). */
const SLOT_RATIO = 310 / 205;
const MIN_SLOTS = 6;

export function BadgeOutlineIcon({ size = 28, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.6 18.2 5.8v5.1c0 1.1-.6 2.1-1.6 2.6L12 15.8l-4.6-2.3c-1-.5-1.6-1.5-1.6-2.6V5.8L12 2.6Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="m9.3 9.2 1.9 1.8 3.6-3.6" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8.6 14.6 7.6 21l4.4-2.1 4.4 2.1-1-6.4" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}

const stateLabel = (t: BadgeTile) => (t.state === 'pending' ? 'Wird eingetragen' : t.state === 'queued' ? 'Wird gesammelt' : null);

export default function BadgesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const account = useActiveAccount();
  const { user } = useUser();
  const { hasAttesterNFT } = useVerificationContext();
  const isCitizen = useIsCitizen();
  const creds = useProfileCredentials({ isCitizen, isAttester: !!hasAttesterNFT });
  const holder = useHolder(account?.address, user?.display_name || user?.username || null);

  const [detailCard, setDetailCard] = useState<RegisterCard | null>(null);
  const [detailTile, setDetailTile] = useState<BadgeTile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tiles = creds.open ? groupBadgesByYear(creds.profile.badges, creds.pendingBadges, creds.queued).flatMap((g) => g.items) : [];
  const slotCount = Math.max(MIN_SLOTS, Math.ceil((tiles.length + 1) / COLUMNS) * COLUMNS);
  const slotW = Math.floor((width - INSET * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const slotH = Math.round(slotW * SLOT_RATIO);

  const close = () => {
    if (busy) return;
    setDetailCard(null);
    setDetailTile(null);
    setError(null);
  };
  const open = (t: BadgeTile) => {
    setError(null);
    if (t.card) setDetailCard(t.card);
    else setDetailTile(t);
  };
  const share = (card: RegisterCard) => {
    if (!card.eventId) return;
    setDetailCard(null);
    router.push(
      shareRoute({ eventId: card.eventId, eventTitle: card.eventTitle ?? card.title, eventDate: card.eventDate ?? '', name: card.title, imageUrl: card.imageUrl }) as any,
    );
  };
  const show = (card: RegisterCard) => {
    setDetailCard(null);
    router.push({ pathname: '/credentials/show/[key]', params: { key: card.key } } as any);
  };
  const toPrivate = async (card: RegisterCard) => {
    if (!account || busy) return;
    setBusy(true);
    setError(null);
    const r = await makePrivate(account, card);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setDetailCard(null);
    await creds.refresh();
  };
  const toPublic = async (card: RegisterCard) => {
    if (!account || busy || !card.typeId) return;
    const typeKey = card.typeId.toLowerCase();
    const held = creds.held.find((h) => h.typeId.toLowerCase() === typeKey);
    if (!held) return;
    setBusy(true);
    setError(null);
    const r = await makePublic(account, held);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setDetailCard(null);
    await creds.refresh();
  };

  return (
    <CredentialScreenFrame title="Abzeichen">
      {creds.loader}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.lead, { color: colors.textSecondary }]}>
          Sammle Abzeichen bei Veranstaltungen in Röbel: Scanne den QR-Code am Eingang, dann landet dein Abzeichen hier.
        </Text>
        <View style={styles.grid}>
          {Array.from({ length: slotCount }, (_, i) => {
            const t = tiles[i];
            if (!t) {
              return (
                <View
                  key={`slot-${i}`}
                  style={[styles.slot, styles.placeholder, { width: slotW, height: slotH, borderColor: colors.border }]}
                  accessibilityLabel="Freier Platz für ein Abzeichen"
                >
                  <BadgeOutlineIcon color={colors.textTertiary} />
                  <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>Abzeichen</Text>
                </View>
              );
            }
            const label = stateLabel(t);
            return (
              <Pressable
                key={t.key}
                onPress={() => open(t)}
                accessibilityRole="button"
                accessibilityLabel={[t.title, label].filter(Boolean).join(', ')}
                style={({ pressed }) => [{ width: slotW, opacity: pressed ? 0.85 : 1 }, t.card?.state === 'expired' && styles.dimmed]}
              >
                <View style={[styles.slot, { width: slotW, height: slotH, backgroundColor: colors.surface }]}>
                  {t.imageUrl ? (
                    <Image source={{ uri: t.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                  ) : (
                    <BadgeOutlineIcon size={36} color={colors.primary} />
                  )}
                  {label ? (
                    <View style={[styles.stateChip, { backgroundColor: colors.background }]}>
                      <Text style={[styles.stateText, { color: colors.textPrimary }]}>{label}</Text>
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={2} style={[styles.title, { color: colors.textPrimary }]}>
                  {t.title}
                </Text>
                {t.date ? <Text style={[styles.date, { color: colors.textSecondary }]}>{formatEventDate(t.date)}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {creds.open && (
        <CredentialDetailSheet
          card={detailCard}
          tile={detailCard ? null : detailTile}
          onShare={share}
          onClose={close}
          onShow={show}
          onMakePrivate={toPrivate}
          onMakePublic={toPublic}
          busy={busy}
          error={error}
          holder={holder}
        />
      )}
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: INSET, paddingTop: 16, paddingBottom: 48 },
  lead: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 16 },
  slot: { borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  placeholder: { borderWidth: 1.5, borderStyle: 'dashed', gap: 8 },
  placeholderText: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  title: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 17, marginTop: 6 },
  date: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 15 },
  stateChip: { position: 'absolute', bottom: 8, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stateText: { fontFamily: fontFamily.semiBold, fontSize: 10 },
  dimmed: { opacity: 0.45 },
});
