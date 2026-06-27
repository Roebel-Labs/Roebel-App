// Smart Event QR landing (roebel.app/e/<id>). Scanned in-app or via deep link, it branches
// by the scanner's Circles state:
//   • first-timer (not a Circles human) → operator invites → registers → mints own Münzen
//   • already onboarded (tourist or citizen) → small RCRC "war in Röbel" attendance badge
// All funded by the operational wallet / funder — the event creator never pays.
//
// The reward screen shows instantly: the coin on the brand gradient, with the
// claim running inside the bottom button (spinner → "Weiter" once done).
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { claimReward, rewardAmountToMuenzen } from '@/lib/rewards-claim';
import { supabase } from '@/lib/supabase';
import { isOnboarded } from '@/lib/roebel-taler';
import MuenzenRewardView from '@/components/rewards/MuenzenRewardView';

type Phase = 'working' | 'done' | 'error';

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
  const ran = useRef(false);

  useEffect(() => {
    const addr = gnosisAccount?.address;
    if (ran.current || !id || !addr) return;
    ran.current = true;
    (async () => {
      try {
        const human = await isOnboarded(addr).catch(() => false);
        if (!human) {
          setWorkLabel('Konto wird eingerichtet…');
          const inv = await supabase.functions.invoke('event-onboard', { body: { wallet: addr, eventId: id } });
          if (inv.error) throw new Error(inv.error.message);
          await onboard(); // registerHuman with the operator as inviter
          const r = await claimReward(addr, 'event_attend', id);
          await refresh();
          if (r.status === 'paid') setAmount(rewardAmountToMuenzen(r.amountAtto));
          setMsg('Du bist dabei! Ab jetzt sammelst du stündlich deine eigenen Münzen.');
          setPhase('done');
        } else {
          const r = await claimReward(addr, 'event_attend', id);
          await refresh();
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
          setPhase('done');
        }
      } catch (e: any) {
        setMsg(e?.message ?? 'Etwas ist schiefgelaufen. Versuch es später erneut.');
        setPhase('error');
      }
    })();
  }, [id, gnosisAccount?.address, onboard, refresh]);

  const waitingForWallet = !gnosisAccount?.address;
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
    viewSubtitle = msg;
  } else {
    viewMessage = msg;
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
