// Röbel Card top-up bottom sheet.
//
// Two internal steps:
//   1. amount — 4 denomination buttons (10 / 25 / 50 / 100 €) + a
//      custom amount input field. Tap Weiter to advance.
//   2. verein — list of verified Vereine (fetched from supabase)
//      plus a "Röbeler Topf" option at the top. Tap "Weiter zu Stripe"
//      to create a checkout session and open Stripe.
//
// On submit, calls createRoebelCardCheckout() against the web backend
// which pre-inserts a pending purchase row and returns a Stripe
// Checkout Session URL. That URL is opened in the in-app browser sheet.
// The webhook on the web side credits the card balance after payment.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import {
  createRoebelCardCheckout,
  openRoebelCardCheckout,
} from '@/lib/roebel-card-topup';
import {
  fetchVerifiedVereine,
  type VereinOption,
} from '@/lib/roebel-card-vereine';
import { formatEuros } from '@/lib/format-currency';

type Denomination = 10 | 25 | 50 | 100 | 'custom';
type Step = 'amount' | 'verein';

const DENOMINATIONS: Exclude<Denomination, 'custom'>[] = [10, 25, 50, 100];

// Must match ROEBEL_CARD_CONFIG in apps/web/src/lib/stripe.ts
const MIN_AMOUNT_CENTS = 500; // 5 €
const MAX_AMOUNT_CENTS = 50000; // 500 €
const FEE_BPS = 1000; // 10 %

interface Props {
  visible: boolean;
  walletAddress: string | null;
  onClose: () => void;
  /** Fired after the Stripe browser sheet dismisses. Caller should
   *  navigate to /roebel-card/topup-success so the user sees a loading
   *  state while the webhook credits their card. */
  onStripeDismissed: () => void;
}

export default function TopUpBottomSheet({
  visible,
  walletAddress,
  onClose,
  onStripeDismissed,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('amount');
  const [selected, setSelected] = useState<Denomination | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null); // null = Röbeler Topf
  const [vereine, setVereine] = useState<VereinOption[]>([]);
  const [vereineLoading, setVereineLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --- Derived state -----------------------------------------------------
  const amountCents = useMemo(() => {
    if (selected === null) return 0;
    if (selected === 'custom') {
      if (!customAmount) return 0;
      const parsed = parseFloat(customAmount.replace(',', '.'));
      if (!Number.isFinite(parsed)) return 0;
      return Math.round(parsed * 100);
    }
    return selected * 100;
  }, [selected, customAmount]);

  const amountValid =
    amountCents >= MIN_AMOUNT_CENTS && amountCents <= MAX_AMOUNT_CENTS;

  const feeCents = Math.floor((amountCents * FEE_BPS) / 10000);
  const totalCents = amountCents + feeCents;

  const canAdvanceAmount = amountValid && !submitting;
  const canSubmit = amountValid && !submitting && walletAddress !== null;

  // --- Load Vereine once when sheet opens --------------------------------
  useEffect(() => {
    if (!visible || vereine.length > 0 || vereineLoading) return;
    setVereineLoading(true);
    fetchVerifiedVereine()
      .then(setVereine)
      .finally(() => setVereineLoading(false));
  }, [visible, vereine.length, vereineLoading]);

  // --- Handlers ----------------------------------------------------------
  const reset = useCallback(() => {
    setStep('amount');
    setSelected(null);
    setCustomAmount('');
    setBeneficiaryId(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdvanceToVerein = () => {
    if (!canAdvanceAmount) return;
    setStep('verein');
  };

  const handleBackToAmount = () => {
    setStep('amount');
  };

  const handleSubmit = async () => {
    if (!canSubmit || !walletAddress) return;
    setSubmitting(true);
    try {
      const session = await createRoebelCardCheckout({
        walletAddress,
        amountCents,
        beneficiaryAccountId: beneficiaryId,
        locale: 'de',
      });
      await openRoebelCardCheckout(session.url);
      // Stripe browser sheet dismissed — parent is responsible for
      // routing to topup-success so the polling UI takes over.
      handleClose();
      onStripeDismissed();
    } catch (err: any) {
      Alert.alert('Fehler', err?.message ?? 'Zahlung konnte nicht gestartet werden.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ------------------------------------------------------------
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoider}
          pointerEvents="box-none"
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                paddingBottom: Math.max(32, insets.bottom + 16),
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.headerRow}>
              {step === 'verein' ? (
                <Pressable onPress={handleBackToAmount} hitSlop={12} style={styles.closeButton}>
                  <Text style={[styles.backIcon, { color: colors.textPrimary }]}>‹</Text>
                </Pressable>
              ) : (
                <View style={styles.closeButton} />
              )}
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {step === 'amount' ? 'Röbel Card aufladen' : 'Wer soll profitieren?'}
              </Text>
              <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton}>
                <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>✕</Text>
              </Pressable>
            </View>

            {step === 'amount' ? (
              <AmountStep
                colors={colors}
                selected={selected}
                customAmount={customAmount}
                amountValid={amountValid}
                amountCents={amountCents}
                feeCents={feeCents}
                totalCents={totalCents}
                onSelect={setSelected}
                onCustomChange={setCustomAmount}
                canAdvance={canAdvanceAmount}
                onAdvance={handleAdvanceToVerein}
              />
            ) : (
              <VereinStep
                colors={colors}
                vereine={vereine}
                vereineLoading={vereineLoading}
                beneficiaryId={beneficiaryId}
                onSelect={setBeneficiaryId}
                totalCents={totalCents}
                submitting={submitting}
                canSubmit={canSubmit}
                onSubmit={handleSubmit}
              />
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Step 1: amount
// ---------------------------------------------------------------------------

function AmountStep({
  colors,
  selected,
  customAmount,
  amountValid,
  amountCents,
  feeCents,
  totalCents,
  onSelect,
  onCustomChange,
  canAdvance,
  onAdvance,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  selected: Denomination | null;
  customAmount: string;
  amountValid: boolean;
  amountCents: number;
  feeCents: number;
  totalCents: number;
  onSelect: (d: Denomination) => void;
  onCustomChange: (v: string) => void;
  canAdvance: boolean;
  onAdvance: () => void;
}) {
  return (
    <ScrollView
      style={styles.amountScroll}
      contentContainerStyle={styles.amountScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Der Nennwert wird deiner Karte gutgeschrieben. Zusätzlich 10 % fließen
        an einen Verein deiner Wahl oder den Röbeler Topf.
      </Text>

      <View style={styles.grid}>
        {DENOMINATIONS.map((denom) => {
          const isSelected = selected === denom;
          return (
            <Pressable
              key={denom}
              onPress={() => onSelect(denom)}
              style={[
                styles.denomButton,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                },
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
        onPress={() => onSelect('custom')}
        style={[
          styles.customRow,
          {
            borderColor: selected === 'custom' ? colors.primary : colors.border,
            backgroundColor:
              selected === 'custom'
                ? (colors.primaryLight ?? colors.surface)
                : colors.surface,
          },
        ]}
      >
        <Text style={[styles.customLabel, { color: colors.textPrimary }]}>
          Eigener Betrag
        </Text>
        <View style={styles.customInputWrap}>
          <TextInput
            value={customAmount}
            onChangeText={onCustomChange}
            placeholder="z.B. 35"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            onFocus={() => onSelect('custom')}
            style={[styles.customInput, { color: colors.textPrimary }]}
          />
          <Text style={[styles.customCurrency, { color: colors.textSecondary }]}>€</Text>
        </View>
      </Pressable>

      {selected === 'custom' && customAmount.length > 0 && !amountValid && (
        <Text style={[styles.helperError, { color: colors.error ?? '#DC2626' }]}>
          Betrag zwischen 5 € und 500 €.
        </Text>
      )}

      {/* Fee breakdown preview */}
      {amountValid && (
        <View style={[styles.breakdown, { backgroundColor: colors.surface }]}>
          <BreakdownRow label="Kartenguthaben" value={formatEuros(amountCents)} colors={colors} />
          <BreakdownRow label="10 % lokaler Beitrag" value={formatEuros(feeCents)} colors={colors} />
          <View style={[styles.breakdownDivider, { backgroundColor: colors.border }]} />
          <BreakdownRow
            label="Gesamtbetrag"
            value={formatEuros(totalCents)}
            colors={colors}
            bold
          />
        </View>
      )}

      <Pressable
        onPress={onAdvance}
        disabled={!canAdvance}
        style={[
          styles.payButton,
          { backgroundColor: colors.primary },
          !canAdvance && { opacity: 0.4 },
        ]}
      >
        <Text style={[styles.payButtonText, { color: colors.onPrimary }]}>
          Weiter
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function BreakdownRow({
  label,
  value,
  colors,
  bold,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
  bold?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text
        style={[
          styles.breakdownLabel,
          { color: bold ? colors.textPrimary : colors.textSecondary },
          bold && { fontFamily: 'Inter-SemiBold' },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.breakdownValue,
          { color: colors.textPrimary },
          bold && { fontFamily: 'Inter-Bold' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Verein picker
// ---------------------------------------------------------------------------

function VereinStep({
  colors,
  vereine,
  vereineLoading,
  beneficiaryId,
  onSelect,
  totalCents,
  submitting,
  canSubmit,
  onSubmit,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  vereine: VereinOption[];
  vereineLoading: boolean;
  beneficiaryId: string | null;
  onSelect: (id: string | null) => void;
  totalCents: number;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Wähle, wer deinen lokalen Beitrag erhält. Den Röbeler Topf verteilen
        alle Bürger gemeinsam über Abstimmungen.
      </Text>

      <ScrollView style={styles.vereinList} contentContainerStyle={styles.vereinListContent}>
        <VereinRow
          selected={beneficiaryId === null}
          onPress={() => onSelect(null)}
          emoji="🏛️"
          name="Röbeler Topf"
          subtitle="Gemeinschaftlicher Fonds"
          colors={colors}
        />

        {vereineLoading && (
          <View style={styles.vereinLoaderRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {!vereineLoading &&
          vereine.map((v) => (
            <VereinRow
              key={v.id}
              selected={beneficiaryId === v.id}
              onPress={() => onSelect(v.id)}
              emoji="🤝"
              avatarUrl={v.avatar_url}
              name={v.name}
              subtitle={v.bio ?? undefined}
              colors={colors}
            />
          ))}

        {!vereineLoading && vereine.length === 0 && (
          <Text style={[styles.vereineEmpty, { color: colors.textTertiary }]}>
            Noch keine Vereine registriert. Dein Beitrag geht in den Röbeler
            Topf.
          </Text>
        )}
      </ScrollView>

      <Pressable
        onPress={onSubmit}
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
            Weiter zu Stripe · {formatEuros(totalCents)}
          </Text>
        )}
      </Pressable>

      <Text style={[styles.legal, { color: colors.textTertiary }]}>
        Du wirst zur sicheren Zahlung bei Stripe weitergeleitet. Nach
        erfolgreicher Zahlung kehrst du automatisch zur App zurück.
      </Text>
    </>
  );
}

function VereinRow({
  selected,
  onPress,
  emoji,
  avatarUrl,
  name,
  subtitle,
  colors,
}: {
  selected: boolean;
  onPress: () => void;
  emoji: string;
  avatarUrl?: string | null;
  name: string;
  subtitle?: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.vereinRow,
        {
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
          backgroundColor: colors.surface,
        },
      ]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.vereinAvatar} contentFit="cover" />
      ) : (
        <View style={[styles.vereinAvatar, styles.vereinAvatarPlaceholder, { backgroundColor: colors.border }]}>
          <Text style={styles.vereinEmoji}>{emoji}</Text>
        </View>
      )}
      <View style={styles.vereinText}>
        <Text style={[styles.vereinName, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {subtitle && (
          <Text style={[styles.vereinSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : 'transparent',
          },
        ]}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
    maxHeight: '90%',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  closeButton: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 20, fontFamily: 'Inter-Regular' },
  backIcon: { fontSize: 32, fontFamily: 'Inter-Regular', lineHeight: 32 },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  amountScroll: {
    maxHeight: 560,
  },
  amountScrollContent: {
    gap: 12,
    paddingBottom: 4,
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
  breakdown: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  breakdownValue: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  breakdownDivider: {
    height: 1,
    marginVertical: 4,
  },
  vereinList: {
    maxHeight: 360,
    marginTop: 4,
  },
  vereinListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  vereinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
  },
  vereinAvatar: { width: 40, height: 40, borderRadius: 20 },
  vereinAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  vereinEmoji: { fontSize: 22 },
  vereinText: { flex: 1, gap: 2 },
  vereinName: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  vereinSubtitle: { fontSize: 12, fontFamily: 'Inter-Regular' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  vereinLoaderRow: {
    alignItems: 'center',
    padding: 16,
  },
  vereineEmpty: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
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
