// Röbel Card — top-up success landing.
//
// The user returns here after Stripe fires its return URL deep link
// (configured in each payment link as roebel://roebel-card/topup-success).
// The Stripe webhook on the web side credits the card balance; this
// screen polls RoebelCardContext every 2 seconds until the new balance
// is reflected, then shows the confirmation + CTA to go back.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import { formatEuros } from '@/lib/format-currency';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_SECONDS = 60;

export default function TopUpSuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { card, refresh } = useRoebelCard();

  // Snapshot the balance at mount so we can detect the webhook-driven
  // increase without needing the Stripe session amount.
  const initialBalanceRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (initialBalanceRef.current === null && card) {
      initialBalanceRef.current = card.balance_cents;
    }
  }, [card]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  useEffect(() => {
    if (confirmed) return;
    void refresh();
    pollingRef.current = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    tickRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return stop;
  }, [refresh, confirmed]);

  // Detect the balance increase that signals the webhook has fired.
  useEffect(() => {
    if (confirmed) return;
    if (!card || initialBalanceRef.current === null) return;
    if (card.balance_cents > initialBalanceRef.current) {
      setConfirmed(true);
      stop();
    }
  }, [card, confirmed]);

  const timedOut = elapsed >= MAX_POLL_SECONDS && !confirmed;

  const delta =
    confirmed && card && initialBalanceRef.current !== null
      ? card.balance_cents - initialBalanceRef.current
      : 0;

  const handleDone = useCallback(() => {
    stop();
    router.replace('/roebel-card/my-card' as any);
  }, [router]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {confirmed ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: '#16a34a' }]}>
              <Text style={styles.iconText}>✓</Text>
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Zahlung erfolgreich
            </Text>
            <Text style={[styles.amount, { color: colors.textPrimary }]}>
              +{formatEuros(delta)}
            </Text>
            {card && (
              <Text style={[styles.balance, { color: colors.textSecondary }]}>
                Neues Guthaben: {formatEuros(card.balance_cents)}
              </Text>
            )}
          </>
        ) : timedOut ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: '#D97706' }]}>
              <Text style={styles.iconText}>!</Text>
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Gleich da…
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Wir haben deine Zahlung noch nicht verbucht. Stripe benötigt manchmal
              ein paar Sekunden länger. Du kannst den Bildschirm schließen — dein
              Guthaben erscheint automatisch, sobald die Zahlung angekommen ist.
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Zahlung wird bestätigt
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Dein Stripe-Beleg ist auf dem Weg. Das Guthaben erscheint hier in
              wenigen Sekunden automatisch.
            </Text>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={handleDone}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            Zu meiner Karte
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 44,
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  amount: {
    fontSize: 40,
    fontFamily: 'Inter-Bold',
    marginTop: 8,
  },
  balance: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
