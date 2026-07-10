import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { parseTalerAmount } from '@/lib/roebel-taler';

type Props = {
  visible: boolean;
  onClose: () => void;
  peerName: string;
  /** Executes the transfer + receipt message. Throws on failure. */
  onSend: (amountRaw: bigint, amountDecimal: number) => Promise<void>;
};

const QUICK_AMOUNTS = ['1', '5', '10'];

/**
 * Bottom sheet for sending Röbel Münzen inside a chat. Reuses the exact
 * transfer mechanics of the wallet's Senden screen (gasless group-token
 * transfer), scoped to the chat peer.
 */
export default function MuenzenSendSheet({ visible, onClose, peerName, onSend }: Props) {
  const { colors } = useTheme();
  const { groupBalance, groupBalanceRaw } = useRoebelTaler();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAmount('');
    setError(null);
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleSend = async () => {
    setError(null);
    let raw: bigint;
    try {
      raw = parseTalerAmount(amount);
    } catch {
      setError('Bitte einen gültigen Betrag eingeben');
      return;
    }
    if (raw <= 0n) {
      setError('Bitte einen Betrag eingeben');
      return;
    }
    if (raw > groupBalanceRaw) {
      setError('Nicht genug Röbel Münzen');
      return;
    }
    setBusy(true);
    try {
      await onSend(raw, Number(amount.replace(',', '.')));
      reset();
      onClose();
    } catch (err) {
      console.error('Münzen senden fehlgeschlagen:', err);
      setError('Senden fehlgeschlagen. Bitte erneut versuchen.');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View />
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Röbel Münzen senden</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            an {peerName}
          </Text>

          <TextInput
            style={[
              styles.amountInput,
              { backgroundColor: colors.surface, color: colors.textPrimary },
            ]}
            value={amount}
            onChangeText={(t) => {
              setAmount(t.replace(/[^0-9.,]/g, ''));
              setError(null);
            }}
            placeholder="0,00"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            editable={!busy}
            autoFocus
          />

          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((q) => (
              <Pressable
                key={q}
                style={[styles.quickChip, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => {
                  setAmount(q);
                  setError(null);
                }}
                disabled={busy}
              >
                <Text style={[styles.quickChipText, { color: colors.textPrimary }]}>{q}</Text>
              </Pressable>
            ))}
            <Text style={[styles.balance, { color: colors.textTertiary }]}>
              Verfügbar:{' '}
              {groupBalance.toLocaleString('de-DE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </View>

          {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

          <Pressable
            style={[
              styles.sendButton,
              { backgroundColor: busy ? colors.disabled : colors.primary },
            ]}
            onPress={handleSend}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={[styles.sendButtonText, { color: colors.onPrimary }]}>Senden</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
    marginBottom: 16,
  },
  amountInput: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  quickChipText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  balance: {
    marginLeft: 'auto',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  error: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 10,
  },
  sendButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
