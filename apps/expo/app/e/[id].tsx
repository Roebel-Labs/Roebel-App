// Smart Event QR landing (roebel.app/e/<id>). Scanned in-app or via deep link, it branches
// by the scanner's Circles state:
//   • first-timer (not a Circles human) → operator invites → registers → mints own Münzen
//   • already onboarded (tourist or citizen) → small RCRC "war in Röbel" attendance badge
// All funded by the operational wallet / funder — the event creator never pays.
//
// The reward screen shows instantly: the coin on the brand gradient, with the
// claim running inside the bottom button (spinner → "Weiter" once done).
//
// Credential register (plan 3b, behind the credentials gate): when the scanned event has a
// badge the result is the full-screen stamp moment (StampMoment) instead, every error state
// included, and a scan without network is queued (lib/credreg/collect-queue.ts) and sent once
// the connection returns. With the gate closed this screen behaves exactly as before.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useActiveAccount } from 'thirdweb/react';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { claimReward, rewardAmountToMuenzen } from '@/lib/rewards-claim';
import { supabase } from '@/lib/supabase';
import { isOnboarded } from '@/lib/roebel-taler';
import MuenzenRewardView from '@/components/rewards/MuenzenRewardView';
import { credApi, fetchPublicEventBadge } from '@/lib/credreg/api';
import { isCredentialsAllowed, useCredentialsGate } from '@/lib/credreg/gate';
import StampMoment, { type StampMomentAction } from '@/components/credentials/StampMoment';
import {
  badgeForScan,
  badgeHref,
  formatEventDate,
  MOMENT_ACTION_LABELS,
  momentFor,
  scanGate,
  shareRoute,
  stateFromClaim,
  VISIBILITY_ROW,
  type BadgeInfo,
  type CollectState,
} from '@/lib/credreg/collect';
import { enqueueCollect, isNetworkFailure } from '@/lib/credreg/collect-queue';
import { setBadgeWish } from '@/lib/credreg/pending';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

const BADGE_HINT = 'Du bekommst ein Abzeichen, sobald der Veranstalter es vergibt.';

/** After an event_attend claim: does the scanned event have a badge? (gate closed or unknown = no). */
async function eventHasBadge(rewardEventId: string): Promise<boolean> {
  if (!(await isCredentialsAllowed().catch(() => false))) return false;
  const { data } = await supabase.from('reward_events').select('event_id').eq('id', rewardEventId).maybeSingle();
  const eventId = (data as { event_id: string | null } | null)?.event_id;
  if (!eventId) return false;
  return !!(await fetchPublicEventBadge(eventId));
}

type Phase = 'working' | 'done' | 'error';

const isOnline = () =>
  NetInfo.fetch()
    .then((st) => st.isConnected !== false)
    .catch(() => true);

export default function EventScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { gnosisAccount, ready } = useGnosisWallet();
  const { onboard, refresh } = useRoebelTaler();
  const [phase, setPhase] = useState<Phase>('working');
  const [amount, setAmount] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  // Label shown next to the spinner inside the button while we work.
  const [workLabel, setWorkLabel] = useState('Beleg wird abgeholt…');
  const [badgeHint, setBadgeHint] = useState(false);
  // Gate open + the event has a badge (or the scan was queued offline): the stamp moment.
  const [collect, setCollect] = useState<CollectState | null>(null);
  const [badgePublic, setBadgePublic] = useState(true);
  const ran = useRef(false);
  const { colors } = useTheme();
  const signer = useActiveAccount();
  const gate = useCredentialsGate();

  useEffect(() => {
    const addr = gnosisAccount?.address;
    if (ran.current || !id || !addr) return;
    ran.current = true;
    (async () => {
      try {
        const gateOpen = await scanGate({ online: isOnline, allowed: isCredentialsAllowed });
        if (gateOpen && !(await isOnline())) {
          // No network at the door: the scan waits on the device, the moment shows at once.
          await enqueueCollect(addr, id);
          setCollect({ kind: 'queued', badge: null });
          setPhase('done');
          return;
        }
        const badgeP: Promise<BadgeInfo | null> = gateOpen ? badgeForScan(id) : Promise.resolve(null);
        /** Gate open: a badge event (or a lost connection) ends in the stamp moment. */
        const stampFor = async (r: Awaited<ReturnType<typeof claimReward>>): Promise<boolean> => {
          if (!gateOpen) return false;
          if (isNetworkFailure(r)) {
            await enqueueCollect(addr, id);
            setCollect({ kind: 'queued', badge: await badgeP });
            return true;
          }
          const badge = await badgeP;
          if (!badge) return false;
          setCollect(stateFromClaim(r, badge));
          return true;
        };
        const human = await isOnboarded(addr).catch(() => false);
        if (!human) {
          setWorkLabel('Konto wird eingerichtet…');
          const inv = await supabase.functions.invoke('event-onboard', { body: { wallet: addr, eventId: id } });
          if (inv.error) throw new Error(inv.error.message);
          await onboard(); // registerHuman with the operator as inviter
          const r = await claimReward(addr, 'event_attend', id);
          await refresh();
          if (await stampFor(r)) {
            setPhase('done');
            return;
          }
          if (r.status === 'paid') setAmount(rewardAmountToMuenzen(r.amountAtto));
          setMsg('Du bist dabei! Ab jetzt sammelst du stündlich deine eigenen Münzen.');
          if (r.status === 'paid' || r.status === 'already_claimed') setBadgeHint(await eventHasBadge(id).catch(() => false));
          setPhase('done');
        } else {
          const r = await claimReward(addr, 'event_attend', id);
          await refresh();
          if (await stampFor(r)) {
            setPhase('done');
            return;
          }
          if (r.status === 'paid') {
            setAmount(rewardAmountToMuenzen(r.amountAtto));
            setMsg('Danke fürs Dabeisein! Du hast ein paar Röbel Münzen als Beleg erhalten.');
          } else if (r.status === 'already_claimed') {
            setMsg('Du hast diesen Event-Beleg bereits erhalten.');
          } else if (r.status === 'rejected') {
            // Map the claim-reward verifier reasons (event_attend) to friendly copy.
            const reason = r.reason ?? '';
            if (reason === 'event ended') {
              setMsg('Dieses Event ist abgelaufen.');
            } else if (reason === 'event not started') {
              setMsg('Dieses Event hat noch nicht begonnen. Schau später noch einmal vorbei.');
            } else if (reason === 'event reward budget reached') {
              setMsg('Für dieses Event sind alle Belege vergeben. Schade — beim nächsten Mal bist du dabei!');
            } else {
              setMsg('Dieser Event-Code ist nicht (mehr) gültig.');
            }
          } else {
            throw new Error(r.reason || 'Konnte nicht eingelöst werden.');
          }
          if (r.status === 'paid' || r.status === 'already_claimed') setBadgeHint(await eventHasBadge(id).catch(() => false));
          setPhase('done');
        }
      } catch (e: any) {
        setMsg(e?.message ?? 'Etwas ist schiefgelaufen. Versuch es später erneut.');
        setPhase('error');
      }
    })();
  }, [id, gnosisAccount?.address, onboard, refresh]);

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

  const waitingForWallet = !gnosisAccount?.address;

  const signedOutStamp = waitingForWallet && ready && gate === true;
  const shown: CollectState | null = signedOutStamp ? { kind: 'signed_out' } : collect;
  if (shown && phase !== 'working') {
    const m = momentFor(shown);
    const badge = shown.kind === 'collected' || shown.kind === 'already' || shown.kind === 'queued' ? shown.badge : null;
    const run: Record<string, () => void> = {
      ansehen: () => badge && router.replace(badgeHref(badge) as any),
      teilen: () => badge && router.replace(shareRoute(badge) as any),
      weiter: () => router.replace('/rewards' as any),
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
      >
        {stampBadge && addrForWish ? (
          <View style={[styles.wishRow, { backgroundColor: colors.surface }]}>
            <View style={styles.wishText}>
              <Text style={[styles.wishLabel, { color: colors.textPrimary }]}>{VISIBILITY_ROW.label}</Text>
              <Text style={[styles.wishHelp, { color: colors.textSecondary }]}>{VISIBILITY_ROW.help}</Text>
            </View>
            <Switch
              value={badgePublic}
              onValueChange={(v) => {
                setBadgePublic(v);
                void setBadgeWish(addrForWish, stampBadge.eventId, v ? 'public' : 'private');
              }}
              accessibilityLabel={VISIBILITY_ROW.label}
            />
          </View>
        ) : null}
      </StampMoment>
    );
  }
  const hasAmount = amount != null && amount > 0;

  // Reward screen shows immediately; the work happens inside the button. Loading
  // covers wallet boot + the in-flight claim; once done we show the amount (or a
  // short message for already-claimed / errors / first-timers).
  let loading = false;
  let viewAmount: number | null = null;
  let viewMessage: string | undefined;
  let viewSubtitle: string | undefined;
  let loadingLabel: string[] | undefined;

  if (waitingForWallet) {
    if (ready) {
      viewMessage = 'Bitte zuerst anmelden.';
    } else {
      loading = true;
      loadingLabel = ['Wallet wird geladen…', 'Einen Moment noch…', 'Fast geschafft…', 'Gleich ist es soweit…'];
    }
  } else if (phase === 'working') {
    loading = true;
    loadingLabel = [workLabel, 'Einen Moment noch…', 'Fast geschafft…', 'Gleich ist es soweit…'];
  } else if (hasAmount) {
    viewAmount = amount;
    viewSubtitle = badgeHint ? `${msg}\n\n${BADGE_HINT}` : msg;
  } else {
    viewMessage = badgeHint ? `${msg}\n\n${BADGE_HINT}` : msg;
  }

  return (
    <MuenzenRewardView
      loading={loading}
      loadingLabel={loadingLabel}
      amount={viewAmount}
      message={viewMessage}
      subtitle={viewSubtitle}
      buttonLabel="Weiter"
      onContinue={() => router.replace('/rewards' as any)}
    />
  );
}

const styles = StyleSheet.create({
  wishRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 12 },
  wishText: { flex: 1, gap: 2 },
  wishLabel: { fontSize: 15, fontFamily: fontFamily.semiBold },
  wishHelp: { fontSize: 13, fontFamily: fontFamily.regular },
});
