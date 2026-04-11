// Röbel Card top-up bottom sheet.
//
// Renders 4 denomination buttons (10 / 25 / 50 / 100 €) + a "custom"
// option with a number input. On submit, calls openRoebelCardTopUp()
// which resolves the corresponding Stripe payment link from env and
// opens it in the in-app browser.
//
// The sheet is a controlled Modal, shown/hidden via the `visible` prop.
// Dismiss via backdrop tap, drag-down on the handle, or the X button.

import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  openRoebelCardTopUp,
  isTopUpConfigured,
  type TopUpDenomination,
} from '@/lib/roebel-card-topup';

interface Props {
  visible: boolean;
  walletAddress: string | null;
  onClose: () => void;
  /** Fired after the Stripe browser sheet dismisses — typically navigate the
   *  caller to /roebel-card/topup-success so the user sees a loading state
   *  while the webhook credits their card. */
  onStripeDismissed: () => void;
}

const DENOMINATIONS: TopUpDenomination[] = [10, 25, 50, 100];

export default function TopUpBottomSheet({
  visible,
  walletAddress,
  onClose,
  onStripeDismissed,
}: Props) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<TopUpDenomination | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const customParsed = useMemo(() => {
    if (!customAmount) return 0;
    const n = parseFloat(customAmount.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [customAmount]);
  const customValid = customParsed >= 1 && customParsed <= 10000;

  const canSubmit =
    !submitting &&
    walletAddress !== null &&
    ((selected !== null && selected !== 'custom') ||
      (selected === 'custom' && customValid));

  const handleSubmit = async () => {
    if (!canSubmit || !walletAddress || selected === null) return;
    setSubmitting(true);
    try {
      await openRoebelCardTopUp({
        walletAddress,
        denomination: selected,
      });
      onClose();
      onStripeDismissed();
    } catch (err: any) {
      Alert.alert('Fehler', err?.message ?? 'Zahlung konnte nicht gestartet werden.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelected(null);
    setCustomAmount('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.background }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Röbel Card aufladen
              </Text>
              <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton}>
                <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>✕</Text>
              </Pressable>
            </View>

            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Wähle einen Betrag. 10 % des Preises fließen automatisch an einen
              lokalen Verein deiner Wahl (oder in den Röbeler Topf).
            </Text>

            <View style={styles.grid}>
              {DENOMINATIONS.map((denom) => {
                const isSelected = selected === denom;
                const configured = isTopUpConfigured(denom);
                return (
                  <Pressable
                    key={denom}
                    onPress={() => {
                      if (!configured) {
                        Alert.alert(
                          'Nicht konfiguriert',
                          `Der Payment Link für ${denom} € ist noch nicht eingerichtet.`,
                        );
                        return;
                      }
                      setSelected(denom);
                    }}
                    style={[
                      styles.denomButton,
                      {
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                      },
                      !configured && { opacity: 0.4 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.denomText,
                        { color: isSelected ? colors.onPrimary : colors.textPrimary },
                      ]}
                    >
                      {denom} €
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => {
                if (!isTopUpConfigured('custom')) {
                  Alert.alert(
                    'Nicht konfiguriert',
                    'Der Payment Link für freie Beträge ist noch nicht eingerichtet.',
                  );
                  return;
                }
                setSelected('custom');
              }}
              style={[
                styles.customRow,
                {
                  borderColor: selected === 'custom' ? colors.primary : colors.border,
                  backgroundColor:
                    selected === 'custom' ? (colors.primaryLight ?? colors.surface) : colors.surface,
                },
                !isTopUpConfigured('custom') && { opacity: 0.4 },
              ]}
            >
              <Text style={[styles.customLabel, { color: colors.textPrimary }]}>
                Eigener Betrag
              </Text>
              <View style={styles.customInputWrap}>
                <TextInput
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  placeholder="z.B. 35"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  editable={selected === 'custom'}
                  onFocus={() => setSelected('custom')}
                  style={[styles.customInput, { color: colors.textPrimary }]}
                />
                <Text style={[styles.customCurrency, { color: colors.textSecondary }]}>€</Text>
              </View>
            </Pressable>
            {selected === 'custom' && !customValid && customAmount.length > 0 && (
              <Text style={[styles.helperError, { color: colors.error ?? '#DC2626' }]}>
                Betrag zwischen 1 und 10 000 €.
              </Text>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[
                styles.payButton,
                { backgroundColor: colors.primary },
                !canSubmit && { opacity: 0.4 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.payButtonText, { color: colors.onPrimary }]}>
                  Weiter zu Stripe
                </Text>
              )}
            </Pressable>

            <Text style={[styles.legal, { color: colors.textTertiary }]}>
              Du wirst zur sicheren Zahlung bei Stripe weitergeleitet. Nach
              erfolgreicher Zahlung kehrst du automatisch zur App zurück.
            </Text>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  avoider: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
  },
  closeButton: { padding: 4 },
  closeIcon: { fontSize: 20, fontFamily: 'Inter-Regular' },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  denomButton: {
    width: '47%',
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  denomText: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
  },
  customRow: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  customLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  customInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  customInput: {
    minWidth: 80,
    textAlign: 'right',
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  customCurrency: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  helperError: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginTop: -4,
    marginLeft: 16,
  },
  payButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  payButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  legal: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
});
