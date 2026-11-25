// Smart Event QR landing (roebel.app/e/<id>), scanned in-app or opened via deep link.
//
// One scan records the attendance (claim-reward `event_attend`, server-verified, once per person;
// it pays NO Röbel Münzen — reward_config amount 0) and shows the full-screen moment: for an event
// with a badge the card opens like a pack ("Abzeichen erhalten"), otherwise a short thank-you.
// Every outcome, error and loading state included, uses the same moment screen; there is no
// Münzen screen and no Münzen account setup here. A scan without network is queued
// (lib/credreg/collect-queue.ts) and sent once the connection returns.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { useActiveAccount } from 'thirdweb/react';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { credApi } from '@/lib/credreg/api';
import StampMoment, { useMomentGradient, type StampMomentAction } from '@/components/credentials/StampMoment';
import {
  badgeForScan,
  defaultScanDeps,
  formatEventDate,
  MOMENT_ACTION_LABELS,
  momentFor,
  scanOutcome,
  shareRoute,
  type CollectState,
} from '@/lib/credreg/collect';
import { setBadgeWish } from '@/lib/credreg/pending';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

const isOnline = () =>
  NetInfo.fetch()
    .then((st) => st.isConnected !== false)
    .catch(() => true);

const GENERIC_ERROR = 'Etwas ist schiefgelaufen. Versuch es später erneut.';

export default function EventScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { gnosisAccount, ready } = useGnosisWallet();
  const [collect, setCollect] = useState<CollectState | null>(null);
  const ran = useRef(false);
  const signer = useActiveAccount();

  useEffect(() => {
    const addr = gnosisAccount?.address;
    if (ran.current || !id || !addr) return;
    ran.current = true;
    (async () => {
      try {
        const badge = await badgeForScan(id);
        setCollect(await scanOutcome(addr, id, badge, defaultScanDeps(isOnline)));
      } catch (e: any) {
        setCollect({ kind: 'error', message: e?.message || GENERIC_ERROR });
      }
    })();
  }, [id, gnosisAccount?.address]);

  // After a stamp: remember the public wish (default on, spec 5.3) and ask the node to issue now.
  const stampBadge = collect && (collect.kind === 'collected' || collect.kind === 'already') ? collect.badge : null;
  const stampEventId = stampBadge?.eventId ?? null;
  const addrForWish = gnosisAccount?.address ?? null;
  useEffect(() => {
    if (!stampEventId || !addrForWish) return;
    void setBadgeWish(addrForWish, stampEventId, 'public');
    // Best effort: without the node's badge key the badge comes with the organiser's tap.
    if (signer) void credApi(signer, 'me', 'badge_nudge', { eventId: stampEventId }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stampEventId, addrForWish]);

  const signedOut = !gnosisAccount?.address && ready;
  const shown: CollectState | null = signedOut ? { kind: 'signed_out' } : collect;
  if (!shown) return <MomentLoading label={gnosisAccount?.address ? 'Wird gesammelt…' : 'Einen Moment…'} />;

  const m = momentFor(shown);
  const badge = shown.kind === 'collected' || shown.kind === 'already' || shown.kind === 'queued' ? shown.badge : null;
  const run: Record<string, () => void> = {
    erhalten: () => router.replace('/badges' as any),
    ansehen: () => router.replace('/badges' as any),
    teilen: () => badge && router.replace(shareRoute(badge) as any),
    weiter: () => (router.canGoBack() ? router.back() : router.replace('/' as any)),
    anmelden: () => router.replace('/login' as any),
    erneut: () => router.replace(`/e/${id}` as any),
  };
  const actions: StampMomentAction[] = m.actions.map((a, k) => ({ label: MOMENT_ACTION_LABELS[a], onPress: run[a], kind: k === 0 ? 'primary' : 'secondary' }));
  return (
    <StampMoment
      stamp={{
        imageUrl: badge?.imageUrl ?? null,
        title: badge?.name ?? 'Abzeichen',
        subtitle: badge ? formatEventDate(badge.eventDate) : '',
        state: m.stampState ?? 'collected',
        size: 'hero',
      }}
      headline={m.headline}
      lines={m.lines}
      muenzen={null}
      actions={actions}
      tone={m.tone}
    />
  );
}

/** Loading on the moment's background: a spinner and one line, nothing else. */
function MomentLoading({ label }: { label: string }) {
  const { colors } = useTheme();
  const gradient = useMomentGradient();
  return (
    <LinearGradient colors={gradient} style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{label}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
