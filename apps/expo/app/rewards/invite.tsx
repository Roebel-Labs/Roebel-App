// "Nachbarn einladen": joined citizens bring the next citizens into Röbel Münzen.
// Plain German, no crypto terms; the mechanics live in lib/muenzen-invite.ts.
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useMuenzenInvite } from '@/hooks/useMuenzenInvite';
import { DAILY_MUENZEN, INVITE_COST, WELCOME_BONUS, type Neighbour } from '@/lib/muenzen-invite';
import BottomDrawer from '@/components/BottomDrawer';
import Skeleton from '@/components/ui/Skeleton';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CheckIcon from '@/assets/icons/check.svg';

const HERO_COIN = require('../../assets/illustration/muenzen/top_hero_coin.png');

const isPasskeyCancel = (e: unknown): boolean =>
  (e as { name?: string } | null)?.name === 'PasskeyCancelledError';

const fmt = (n: number) => Math.floor(n).toLocaleString('de-DE');

type Colors = ReturnType<typeof useTheme>['colors'];

export default function InviteNeighboursScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    ready, onboarded, overview, loading, failed, saving, busy, openInvites, freeSlots, saved, daysLeft,
    toggleSaving, invite, withdraw, reload,
  } = useMuenzenInvite();

  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [justInvited, setJustInvited] = useState<Neighbour | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const neighbours = overview?.neighbours ?? [];
  const waitingCount = neighbours.filter((n) => n.status === 'waiting').length;
  const filtered = query.trim()
    ? neighbours.filter((n) => n.name.toLowerCase().includes(query.trim().toLowerCase()))
    : neighbours;

  const onInvite = useCallback(
    (n: Neighbour) => {
      Alert.alert(
        `${n.name} einladen?`,
        `Lade nur ein, wen du persönlich kennst. Sobald ${n.name} mitmacht, werden ${INVITE_COST} deiner angesparten Münzen eingelöst und ${n.name} startet mit ${WELCOME_BONUS} Röbel Münzen.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Einladen',
            onPress: async () => {
              try {
                await invite(n);
                if (Platform.OS !== 'web') {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                }
                setJustInvited(n);
              } catch (e) {
                if (isPasskeyCancel(e)) return;
                console.warn('[Münzen] invite failed:', e);
                Alert.alert('Einladung nicht gesendet', 'Das hat nicht geklappt. Bitte versuche es gleich erneut.');
              }
            },
          },
        ],
      );
    },
    [invite],
  );

  const onWithdraw = useCallback(
    (n: Neighbour) => {
      Alert.alert(
        'Einladung zurückziehen?',
        `${n.name} kann dann nicht mehr über deine Einladung mitmachen. Deine angesparten Münzen werden wieder frei.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Zurückziehen',
            style: 'destructive',
            onPress: async () => {
              try {
                await withdraw(n);
              } catch (e) {
                if (isPasskeyCancel(e)) return;
                console.warn('[Münzen] withdraw failed:', e);
                Alert.alert('Nicht zurückgezogen', 'Das hat nicht geklappt. Bitte versuche es gleich erneut.');
              }
            },
          },
        ],
      );
    },
    [withdraw],
  );

  const onTellNeighbour = useCallback(async () => {
    if (!justInvited) return;
    try {
      await Share.share({
        message:
          `Hallo ${justInvited.name}, ich habe dich zu den Röbel Münzen eingeladen. ` +
          'Öffne die Röbel App, gehe zu „Belohnungen“ und tippe auf „Belohnungen erhalten“. ' +
          `Du startest mit ${WELCOME_BONUS} Röbel Münzen.`,
      });
    } catch {
      /* share sheet dismissed */
    }
  }, [justInvited]);

  const progress = Math.max(0, Math.min(1, saved / INVITE_COST));
  const joinedShare = overview && overview.citizens > 0 ? overview.joined / overview.citizens : 0;

  const savingsLine =
    freeSlots > 0
      ? freeSlots === 1
        ? 'Bereit: Du kannst jetzt eine:n Nachbar:in einladen.'
        : `Bereit: Du kannst jetzt ${freeSlots} Nachbar:innen einladen.`
      : saving
        ? `Noch etwa ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'}, wenn du täglich abholst.`
        : 'Schalte das Ansparen ein, um deine erste Einladung vorzubereiten.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={22} height={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Nachbarn einladen</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Why — the idea in two sentences, plus how far the town is. */}
        <View style={styles.hero}>
          <Image source={HERO_COIN} style={styles.heroCoin} resizeMode="contain" />
          <Text style={styles.heroTitle}>Röbel Münzen wachsen von Mensch zu Mensch</Text>
          <Text style={styles.heroBody}>
            Niemand verteilt sie von oben. Wer schon dabei ist, holt die Nächsten dazu und steht mit
            seinem Wort für sie ein. So entsteht ein Geld, das auf Vertrauen unter Nachbarn beruht.
          </Text>
          {overview ? (
            <View style={styles.townProgress} accessible accessibilityLabel={`${overview.joined} von ${overview.citizens} Bürgerinnen und Bürgern sind dabei`}>
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: `${Math.round(joinedShare * 100)}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={styles.townProgressText}>
                {overview.joined} von {overview.citizens} Bürger:innen sind dabei
              </Text>
            </View>
          ) : loading ? (
            <Skeleton width={220} height={14} radius={6} style={{ marginTop: 14 }} />
          ) : null}
        </View>

        {!ready ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : !onboarded ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Erst selbst mitmachen</Text>
            <Text style={styles.cardBody}>
              Einladen kann, wer selbst schon Röbel Münzen sammelt. Tippe unter „Belohnungen“ auf
              „Belohnungen erhalten“. Wenn dich noch niemand eingeladen hat, bitte eine:n Nachbar:in darum.
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Zu den Belohnungen</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Savings towards the next invitation. */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Deine nächste Einladung</Text>
              <View style={styles.savedRow}>
                <Text style={styles.savedValue}>{fmt(Math.min(saved, INVITE_COST))}</Text>
                <Text style={styles.savedOf}> von {INVITE_COST} Münzen angespart</Text>
              </View>
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: INVITE_COST, now: Math.floor(Math.min(saved, INVITE_COST)) }}
              >
                <View
                  style={[
                    styles.trackFill,
                    { width: `${Math.round(progress * 100)}%`, backgroundColor: freeSlots > 0 ? colors.success : colors.primary },
                  ]}
                />
              </View>
              <Text style={[styles.cardBody, freeSlots > 0 && { color: colors.success, fontFamily: fontFamily.semiBold }]}>
                {savingsLine}
              </Text>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Für eine Einladung ansparen</Text>
                  <Text style={styles.switchHint}>
                    Solange an, bleiben abgeholte Münzen bei dir, bis {INVITE_COST} zusammen sind. Sie zählen
                    zu deinem Guthaben, lassen sich in dieser Zeit aber nicht senden.
                  </Text>
                </View>
                <Switch
                  value={saving}
                  onValueChange={(on) => { void toggleSaving(on); }}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  accessibilityLabel="Für eine Einladung ansparen"
                />
              </View>
              {openInvites > 0 ? (
                <Text style={styles.switchHint}>
                  {openInvites === 1 ? 'Eine Einladung ist offen' : `${openInvites} Einladungen sind offen`}: {fmt(openInvites * INVITE_COST)} Münzen
                  bleiben dafür zurückgelegt, bis sie angenommen oder zurückgezogen {openInvites === 1 ? 'ist' : 'sind'}.
                </Text>
              ) : null}
            </View>

            {/* How it works — three steps. */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>So funktioniert es</Text>
              <Step n={1} styles={styles} title="Ansparen">
                Eine Einladung kostet dich {INVITE_COST} Münzen. Das sind etwa {Math.ceil(INVITE_COST / DAILY_MUENZEN)} Tage Abholen.
              </Step>
              <Step n={2} styles={styles} title="Einladen">
                Wähle jemanden, den du persönlich kennst. Deine Einladung ist dein Wort: Das ist ein echter Mensch aus Röbel.
              </Step>
              <Step n={3} styles={styles} title="Gemeinsam sammeln">
                Dein:e Nachbar:in startet mit {WELCOME_BONUS} Röbel Münzen, holt danach selbst täglich Münzen ab und kann die Nächsten einladen.
              </Step>
              <View style={styles.note}>
                <Text style={styles.noteTitle}>Warum kostet eine Einladung etwas?</Text>
                <Text style={styles.noteText}>
                  Die {INVITE_COST} Münzen bekommt niemand, sie werden gelöscht. {WELCOME_BONUS} entstehen neu als
                  Startguthaben. So ist jede Einladung etwas wert, und niemand kann massenhaft falsche Konten
                  anlegen. Eingeladen werden können nur bestätigte Bürger:innen.
                </Text>
              </View>
            </View>

            {/* Who is still waiting. */}
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Noch nicht dabei</Text>
              {overview ? (
                <Text style={styles.sectionMeta}>
                  {waitingCount === 0 ? 'niemand wartet' : `${waitingCount} ${waitingCount === 1 ? 'wartet' : 'warten'}`}
                </Text>
              ) : null}
            </View>

            {neighbours.length > 8 ? (
              <TextInput
                placeholder="Name suchen"
                placeholderTextColor={colors.textTertiary}
                value={query}
                onChangeText={setQuery}
                style={styles.search}
                accessibilityLabel="Nach Namen suchen"
              />
            ) : null}

            {loading && !overview ? (
              <View style={{ gap: 10 }}>
                {[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={16} />)}
              </View>
            ) : failed && !overview ? (
              <View style={styles.card}>
                <Text style={styles.cardBody}>Die Liste konnte gerade nicht geladen werden.</Text>
                <Pressable
                  onPress={() => { void reload(); }}
                  style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryBtnText}>Erneut versuchen</Text>
                </Pressable>
              </View>
            ) : neighbours.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Alle sind dabei</Text>
                <Text style={styles.cardBody}>
                  Jede:r bestätigte Bürger:in sammelt schon Röbel Münzen. Sobald neue Bürger:innen bestätigt
                  werden, erscheinen sie hier.
                </Text>
              </View>
            ) : filtered.length === 0 ? (
              <Text style={styles.cardBody}>Kein Treffer für „{query.trim()}“.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {filtered.map((n) => (
                  <NeighbourRow
                    key={n.address}
                    n={n}
                    colors={colors}
                    styles={styles}
                    busy={busy === n.address}
                    disabled={busy !== null}
                    canInvite={freeSlots > 0}
                    onInvite={onInvite}
                    onWithdraw={onWithdraw}
                  />
                ))}
              </View>
            )}
            {neighbours.some((n) => n.status === 'waiting') && freeSlots === 0 ? (
              <Text style={styles.footHint}>
                „Einladen“ wird aktiv, sobald {INVITE_COST} Münzen angespart sind.
              </Text>
            ) : null}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <BottomDrawer visible={justInvited !== null} onClose={() => setJustInvited(null)}>
        <View style={styles.sheet}>
          <View style={[styles.sheetBadge, { backgroundColor: colors.successBackground }]}>
            <CheckIcon width={28} height={28} color={colors.success} />
          </View>
          <Text style={styles.sheetTitle}>{justInvited?.name} ist eingeladen</Text>
          <Text style={styles.sheetBody}>
            Jetzt fehlt nur noch ein Schritt: {justInvited?.name} öffnet die Röbel App, geht zu
            „Belohnungen“ und tippt auf „Belohnungen erhalten“. Sag am besten kurz Bescheid.
          </Text>
          <Pressable
            onPress={onTellNeighbour}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Bescheid sagen</Text>
          </Pressable>
          <Pressable onPress={() => setJustInvited(null)} style={styles.sheetClose} accessibilityRole="button">
            <Text style={styles.sheetCloseText}>Fertig</Text>
          </Pressable>
        </View>
      </BottomDrawer>
    </SafeAreaView>
  );
}

function Step({
  n, title, children, styles,
}: { n: number; title: string; children: React.ReactNode; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{children}</Text>
      </View>
    </View>
  );
}

function NeighbourRow({
  n, colors, styles, busy, disabled, canInvite, onInvite, onWithdraw,
}: {
  n: Neighbour;
  colors: Colors;
  styles: ReturnType<typeof makeStyles>;
  busy: boolean;
  disabled: boolean;
  canInvite: boolean;
  onInvite: (n: Neighbour) => void;
  onWithdraw: (n: Neighbour) => void;
}) {
  const sub =
    n.status === 'invitedByMe'
      ? 'Von dir eingeladen, muss nur noch mitmachen'
      : n.status === 'invitedByOther'
        ? n.inviterName ? `Schon eingeladen von ${n.inviterName}` : 'Schon eingeladen'
        : 'Wartet auf eine Einladung';
  return (
    <View style={styles.row}>
      {n.imageUrl ? (
        <Image source={{ uri: n.imageUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>{n.name.trim().charAt(0).toUpperCase() || 'N'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{n.name}</Text>
        <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} style={{ width: 96 }} />
      ) : n.status === 'waiting' ? (
        <Pressable
          onPress={() => onInvite(n)}
          disabled={!canInvite || disabled}
          style={({ pressed }) => [
            styles.rowBtn,
            { backgroundColor: canInvite ? colors.primary : colors.surface, opacity: pressed || (disabled && canInvite) ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${n.name} einladen`}
          accessibilityState={{ disabled: !canInvite || disabled }}
        >
          <Text style={[styles.rowBtnText, { color: canInvite ? '#fff' : colors.textTertiary }]}>Einladen</Text>
        </Pressable>
      ) : n.status === 'invitedByMe' ? (
        <Pressable
          onPress={() => onWithdraw(n)}
          disabled={disabled}
          hitSlop={8}
          style={({ pressed }) => [styles.rowBtn, styles.rowBtnGhost, { opacity: pressed || disabled ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Einladung an ${n.name} zurückziehen`}
        >
          <Text style={[styles.rowBtnText, { color: colors.textSecondary }]}>Zurückziehen</Text>
        </Pressable>
      ) : (
        <CheckIcon width={20} height={20} color={colors.success} />
      )}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    backBtn: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fontFamily.headingSemiBold, fontSize: 17, color: colors.textPrimary },
    content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },

    hero: { alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
    heroCoin: { width: 92, height: 98 },
    heroTitle: {
      fontFamily: fontFamily.heading,
      fontSize: 24,
      lineHeight: 29,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: 8,
    },
    heroBody: {
      fontFamily: fontFamily.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
    },
    townProgress: { alignSelf: 'stretch', marginTop: 16, gap: 6 },
    townProgressText: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    cardTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
    cardBody: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary },

    savedRow: { flexDirection: 'row', alignItems: 'baseline' },
    savedValue: { fontFamily: fontFamily.heading, fontSize: 32, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
    savedOf: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textSecondary },
    track: { height: 8, borderRadius: 999, backgroundColor: colors.surface, overflow: 'hidden' },
    trackFill: { height: 8, borderRadius: 999 },

    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    switchLabel: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
    switchHint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 2 },

    step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    stepBadge: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBadgeText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.primary },
    stepTitle: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
    stepBody: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
    note: { padding: 12, borderRadius: 12, backgroundColor: colors.surface, gap: 4 },
    noteTitle: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.textPrimary },
    noteText: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, color: colors.textSecondary },

    listHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 },
    sectionTitle: { fontFamily: fontFamily.headingSemiBold, fontSize: 20, color: colors.textPrimary },
    sectionMeta: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textSecondary },
    search: {
      height: 44,
      borderRadius: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      fontFamily: fontFamily.regular,
      fontSize: 15,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    avatar: { width: 44, height: 44, borderRadius: 999 },
    avatarFallback: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.primary },
    rowName: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
    rowSub: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.textSecondary, marginTop: 2 },
    rowBtn: { minWidth: 96, height: 44, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    rowBtnGhost: { borderWidth: 1, borderColor: colors.border },
    rowBtnText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
    footHint: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textTertiary, textAlign: 'center' },

    primaryBtn: { alignSelf: 'stretch', height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryBtnText: { fontFamily: fontFamily.heading, fontSize: 16, color: '#fff' },
    secondaryBtn: {
      alignSelf: 'flex-start',
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.textPrimary },

    sheet: { alignItems: 'center', paddingTop: 8, paddingBottom: 16, gap: 12 },
    sheetBadge: { width: 56, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    sheetTitle: { fontFamily: fontFamily.semiBold, fontSize: 22, color: colors.textPrimary, textAlign: 'center' },
    sheetBody: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    sheetClose: { paddingVertical: 10 },
    sheetCloseText: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textSecondary },
  });
}
