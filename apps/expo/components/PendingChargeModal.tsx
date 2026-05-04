// Full-screen approval modal shown on the buyer's phone when a partner
// creates a pending charge against their card.
//
// Renders partner name + amount + expiry countdown + Approve/Decline
// buttons. The parent screen is responsible for polling pending charges
// and passing the first pending one as a prop; this component handles
// the approval/decline RPC calls and reports success via onResolved.

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { formatEuros } from '@/lib/format-currency';
import {
  approveCharge,
  declineCharge,
  chargeErrorMessage,
  type PendingChargeWithPartner,
} from '@/lib/supabase-roebel-card-charges';

interface Props {
  charge: PendingChargeWithPartner | null;
  walletAddress: string;
  onResolved: () => void;
}

export default function PendingChargeModal({ charge, walletAddress, onResolved }: Props) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Recompute the countdown every second while the modal is open.
  useEffect(() => {
    if (!charge) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(charge.expires_at).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        onResolved();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [charge, onResolved]);

  const handleApprove = async () => {
    if (!charge || busy) return;
    setBusy(true);
    try {
      await approveCharge(charge.id, walletAddress);
      onResolved();
    } catch (err) {
      Alert.alert('Zahlung abgelehnt', chargeErrorMessage(err));
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!charge || busy) return;
    setBusy(true);
    try {
      await declineCharge(charge.id, walletAddress);
    } catch (err) {
      // Swallow — the buyer's intent was to decline, so any "already
      // expired" type error just means we converge on the same result.
      console.warn('declineCharge failed:', err);
    } finally {
      setBusy(false);
      onResolved();
    }
  };

  if (!charge) return null;

  console.log('[PendingChargeModal] render', {
    id: charge.id,
    partner: charge.partner_name,
    amount_cents: charge.amount_cents,
    secondsLeft,
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDecline}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>Zahlungsanfrage</Text>
          <Text style={[styles.partnerName, { color: colors.textPrimary }]} numberOfLines={2}>
            {charge.partner_name ?? 'Unbekannter Partner'}
          </Text>
          <Text style={[styles.amount, { color: colors.textPrimary }]}>
            {formatEuros(charge.amount_cents)}
          </Text>

          {charge.partner_note ? (
            <Text
              style={[styles.note, { color: colors.textSecondary }]}
              numberOfLines={3}
            >
              "{charge.partner_note}"
            </Text>
          ) : null}

          <Text style={[styles.countdown, { color: colors.textTertiary }]}>
            Läuft ab in {formatCountdown(secondsLeft)}
          </Text>

          <Pressable
            onPress={handleApprove}
            disabled={busy || secondsLeft <= 0}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              (busy || secondsLeft <= 0) && { opacity: 0.5 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                Bestätigen
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleDecline}
            disabled={busy}
            style={styles.secondaryButton}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
              Ablehnen
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  partnerName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  amount: {
    fontSize: 40,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginVertical: 8,
  },
  note: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  countdown: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
