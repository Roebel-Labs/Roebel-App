// Partner charge flow — two phases in a single screen.
//
// Phase 1 "entry": partner types amount + optional note → taps "Fordern"
//   → createCharge() inserts a pending row and we transition to phase 2.
// Phase 2 "waiting": polls fetchChargeById every 2s, rendering a progress
//   UI and a countdown. Resolves into one of:
//     - approved → success screen with "Zurück zum Dashboard"
//     - declined → rejection message + "Nochmal versuchen"
//     - expired → timeout message + "Nochmal versuchen"

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import {
  createCharge,
  fetchChargeById,
  chargeErrorMessage,
  type RoebelCardChargeRow,
} from '@/lib/supabase-roebel-card-charges';
import { fetchPartnerByAccountId } from '@/lib/supabase-roebel-card-partners';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

type Phase = 'entry' | 'creating' | 'waiting' | 'approved' | 'declined' | 'expired';

const POLL_INTERVAL_MS = 2000;

export default function PartnerChargeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const { cardId } = useLocalSearchParams<{ cardId: string }>();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>('entry');
  const [charge, setCharge] = useState<RoebelCardChargeRow | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parsedAmount = parseFloat(amount.replace(',', '.'));
  const amountCents = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) : 0;
  const amountValid = amountCents > 0 && amountCents <= 1_000_000; // ≤ 10 000 €

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const startPolling = useCallback((chargeId: string, expiresAt: string) => {
    stopPolling();

    const expiresAtMs = new Date(expiresAt).getTime();
    const tickCountdown = () => {
      const remaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setPhase('expired');
        stopPolling();
      }
    };
    tickCountdown();
    countdownRef.current = setInterval(tickCountdown, 1000);

    const tickPoll = async () => {
      const row = await fetchChargeById(chargeId);
      if (!row) return;
      setCharge(row);
      if (row.status === 'approved') {
        setPhase('approved');
        stopPolling();
      } else if (row.status === 'declined') {
        setPhase('declined');
        stopPolling();
      } else if (row.status === 'expired') {
        setPhase('expired');
        stopPolling();
      }
    };
    void tickPoll();
    pollingRef.current = setInterval(() => {
      void tickPoll();
    }, POLL_INTERVAL_MS);
  }, []);

  const handleSubmit = async () => {
    if (!amountValid || !cardId || typeof cardId !== 'string') return;
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      Alert.alert('Kein Unternehmensaccount', 'Bitte wechsle zu deinem Partneraccount.');
      return;
    }

    setPhase('creating');
    try {
      const partner = await fetchPartnerByAccountId(activeAccount.id);
      if (!partner) {
        Alert.alert('Nicht registriert', 'Dieses Unternehmen ist nicht als Partner freigeschaltet.');
        setPhase('entry');
        return;
      }
      if (partner.status !== 'approved') {
        Alert.alert(
          'Noch nicht freigeschaltet',
          'Zahlungen kannst du erst erfassen, sobald dein Antrag geprüft wurde.',
        );
        setPhase('entry');
        return;
      }

      const newCharge = await createCharge({
        cardId,
        partnerId: partner.id,
        amountCents,
        partnerNote: note.trim() || undefined,
      });

      setCharge(newCharge);
      setPhase('waiting');
      startPolling(newCharge.id, newCharge.expires_at);
    } catch (err) {
      Alert.alert('Fehler', chargeErrorMessage(err));
      setPhase('entry');
    }
  };

  const reset = () => {
    stopPolling();
    setCharge(null);
    setAmount('');
    setNote('');
    setPhase('entry');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Zahlung erfassen
        </Text>
        <View style={styles.headerButton} />
      </View>

      {phase === 'entry' || phase === 'creating' ? (
        <EntryPhase
          colors={colors}
          amount={amount}
          note={note}
          onAmountChange={setAmount}
          onNoteChange={setNote}
          amountValid={amountValid}
          submitting={phase === 'creating'}
          onSubmit={handleSubmit}
        />
      ) : phase === 'waiting' ? (
        <WaitingPhase
          colors={colors}
          amountCents={charge?.amount_cents ?? 0}
          secondsLeft={secondsLeft}
        />
      ) : phase === 'approved' ? (
        <ResultPhase
          colors={colors}
          kind="approved"
          amountCents={charge?.amount_cents ?? 0}
          onDone={() => router.replace('/roebel-card/partner' as any)}
          onRetry={reset}
        />
      ) : phase === 'declined' ? (
        <ResultPhase
          colors={colors}
          kind="declined"
          amountCents={charge?.amount_cents ?? 0}
          onDone={() => router.replace('/roebel-card/partner' as any)}
          onRetry={reset}
        />
      ) : (
        <ResultPhase
          colors={colors}
          kind="expired"
          amountCents={charge?.amount_cents ?? 0}
          onDone={() => router.replace('/roebel-card/partner' as any)}
          onRetry={reset}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function EntryPhase({
  colors,
  amount,
  note,
  onAmountChange,
  onNoteChange,
  amountValid,
  submitting,
  onSubmit,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  amount: string;
  note: string;
  onAmountChange: (v: string) => void;
  onNoteChange: (v: string) => void;
  amountValid: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.entryContent} keyboardShouldPersistTaps="handled">
      <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>Betrag</Text>
      <View style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          value={amount}
          onChangeText={onAmountChange}
          placeholder="0,00"
          placeholderTextColor={colors.textTertiary}
          keyboardType="decimal-pad"
          style={[styles.amountInput, { color: colors.textPrimary }]}
          autoFocus
        />
        <Text style={[styles.amountCurrency, { color: colors.textSecondary }]}>€</Text>
      </View>

      <Text style={[styles.eyebrow, { color: colors.textTertiary, marginTop: 24 }]}>Notiz (optional)</Text>
      <TextInput
        value={note}
        onChangeText={onNoteChange}
        placeholder="z.B. Tisch 3 / Mittagsmenü"
        placeholderTextColor={colors.textTertiary}
        style={[
          styles.noteInput,
          { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary },
        ]}
        maxLength={120}
      />

      <Pressable
        onPress={onSubmit}
        disabled={!amountValid || submitting}
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary },
          (!amountValid || submitting) && { opacity: 0.5 },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Fordern</Text>
        )}
      </Pressable>

      <Text style={[styles.helper, { color: colors.textTertiary }]}>
        Der Kunde muss die Zahlung auf seinem Handy innerhalb von 2 Minuten bestätigen.
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

function WaitingPhase({
  colors,
  amountCents,
  secondsLeft,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  amountCents: number;
  secondsLeft: number;
}) {
  return (
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.waitingTitle, { color: colors.textPrimary }]}>
        Warte auf Bestätigung
      </Text>
      <Text style={[styles.waitingAmount, { color: colors.textPrimary }]}>
        {formatEuros(amountCents)}
      </Text>
      <Text style={[styles.waitingSubtitle, { color: colors.textSecondary }]}>
        Der Kunde bestätigt die Zahlung auf seinem Handy.
      </Text>
      <Text style={[styles.countdown, { color: colors.textTertiary }]}>
        Noch {formatCountdown(secondsLeft)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function ResultPhase({
  colors,
  kind,
  amountCents,
  onDone,
  onRetry,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  kind: 'approved' | 'declined' | 'expired';
  amountCents: number;
  onDone: () => void;
  onRetry: () => void;
}) {
  const iconBg =
    kind === 'approved' ? '#16a34a' : kind === 'declined' ? '#DC2626' : '#6b7280';
  const iconText = kind === 'approved' ? '✓' : kind === 'declined' ? '✕' : '⌛';
  const title =
    kind === 'approved'
      ? 'Zahlung bestätigt'
      : kind === 'declined'
      ? 'Zahlung abgelehnt'
      : 'Zeit abgelaufen';
  const body =
    kind === 'approved'
      ? `${formatEuros(amountCents)} wurden deiner Tagesabrechnung gutgeschrieben.`
      : kind === 'declined'
      ? 'Der Kunde hat die Zahlung abgelehnt.'
      : 'Der Kunde hat die Zahlung nicht rechtzeitig bestätigt.';

  return (
    <View style={styles.centerFill}>
      <View style={[styles.resultIcon, { backgroundColor: iconBg }]}>
        <Text style={styles.resultIconText}>{iconText}</Text>
      </View>
      <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.resultBody, { color: colors.textSecondary }]}>{body}</Text>

      <View style={styles.resultButtons}>
        {kind !== 'approved' && (
          <Pressable
            onPress={onRetry}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              Nochmal versuchen
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={onDone}
          style={
            kind === 'approved'
              ? [styles.primaryButton, { backgroundColor: colors.primary }]
              : styles.secondaryButton
          }
        >
          <Text
            style={[
              kind === 'approved' ? styles.primaryButtonText : styles.secondaryButtonText,
              { color: kind === 'approved' ? colors.onPrimary : colors.textSecondary },
            ]}
          >
            Zurück zum Dashboard
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  entryContent: { padding: 24, gap: 8 },
  eyebrow: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 80,
    gap: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 42,
    fontFamily: 'Inter-Bold',
  },
  amountCurrency: {
    fontSize: 28,
    fontFamily: 'Inter-Medium',
  },
  noteInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  helper: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 12,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  waitingTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    marginTop: 16,
  },
  waitingAmount: {
    fontSize: 36,
    fontFamily: 'Inter-Bold',
    marginTop: 4,
  },
  waitingSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  countdown: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginTop: 8,
  },
  resultIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resultIconText: {
    fontSize: 44,
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },
  resultTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    marginTop: 8,
  },
  resultBody: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  resultButtons: {
    alignSelf: 'stretch',
    marginTop: 16,
  },
});
