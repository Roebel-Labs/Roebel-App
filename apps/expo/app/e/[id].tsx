// Smart Event QR landing (roebel.app/e/<id>). Scanned in-app or via deep link, it branches
// by the scanner's Circles state:
//   • first-timer (not a Circles human) → operator invites → registers → mints own Münzen
//   • already onboarded (tourist or citizen) → small RCRC "war in Röbel" attendance badge
// All funded by the operational wallet / funder — the event creator never pays.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { claimReward } from '@/lib/rewards-claim';
import { supabase } from '@/lib/supabase';
import { isOnboarded } from '@/lib/roebel-taler';

type Phase = 'working' | 'done' | 'error';

export default function EventScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { gnosisAccount, ready } = useGnosisWallet();
  const { onboard, refresh } = useRoebelTaler();
  const [phase, setPhase] = useState<Phase>('working');
  const [emoji, setEmoji] = useState('🎉');
  const [msg, setMsg] = useState('Einen Moment…');
  const ran = useRef(false);

  useEffect(() => {
    const addr = gnosisAccount?.address;
    if (ran.current || !id || !addr) return;
    ran.current = true;
    (async () => {
      try {
        const human = await isOnboarded(addr).catch(() => false);
        if (!human) {
          setMsg('Willkommen! Wir richten dein Konto ein…');
          const inv = await supabase.functions.invoke('event-onboard', { body: { wallet: addr, eventId: id } });
          if (inv.error) throw new Error(inv.error.message);
          await onboard(); // registerHuman with the operator as inviter
          await claimReward(addr, 'event_attend', id);
          await refresh();
          setEmoji('🎉');
          setMsg('Du bist dabei! Ab jetzt sammelst du stündlich deine eigenen Münzen.');
          setPhase('done');
        } else {
          setMsg('Beleg wird abgeholt…');
          const r = await claimReward(addr, 'event_attend', id);
          await refresh();
          if (r.status === 'paid') {
            setEmoji('🪙');
            setMsg('Danke fürs Dabeisein! Du hast ein paar Röbel Münzen als Beleg erhalten.');
          } else if (r.status === 'already_claimed') {
            setEmoji('✓');
            setMsg('Du hast diesen Event-Beleg bereits erhalten.');
          } else if (r.status === 'rejected') {
            setEmoji('⌛');
            setMsg(r.reason === 'event ended' ? 'Dieses Event ist abgelaufen.' : 'Dieser Event-Code ist nicht (mehr) gültig.');
          } else {
            throw new Error(r.reason || 'Konnte nicht eingelöst werden.');
          }
          setPhase('done');
        }
      } catch (e: any) {
        setEmoji('⚠️');
        setMsg(e?.message ?? 'Etwas ist schiefgelaufen. Versuch es später erneut.');
        setPhase('error');
      }
    })();
  }, [id, gnosisAccount?.address, onboard, refresh]);

  // Wallet still booting / not signed in.
  const waitingForWallet = !gnosisAccount?.address;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        {phase === 'working' ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.msg, { color: colors.textPrimary }]}>
              {waitingForWallet ? (ready ? 'Bitte zuerst anmelden.' : 'Wallet wird geladen…') : msg}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={[styles.msg, { color: colors.textPrimary }]}>{msg}</Text>
            <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.replace('/rewards' as any)}>
              <Text style={styles.btnText}>Zu meinen Münzen</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 18 },
  emoji: { fontSize: 56 },
  msg: { fontFamily: 'Inter-Medium', fontSize: 17, textAlign: 'center', lineHeight: 24 },
  btn: { marginTop: 8, height: 50, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 16 },
});
