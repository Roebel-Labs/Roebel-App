// Röbel Card top-up bottom sheet.
//
// Differentiated by buyerMode:
//   citizen  — standard amount picker, no fee
//   tourist  — standard amount picker, +fee on top, donation tier chips
//   sachbezug — default 50 €, "Weniger" reveals 10/25/50 chips, fee deducted
//
// After amount → Verein picker → Stripe checkout in-app browser.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import type { BuyerMode } from '@/app/roebel-card/my-card';
import BottomDrawer from './BottomDrawer';

type Denomination = 10 | 25 | 50 | 100 | 'custom';
type Step = 'amount' | 'verein';

const DENOMINATIONS: Exclude<Denomination, 'custom'>[] = [10, 25, 50, 100];
const SACHBEZUG_DENOMINATIONS = [10, 25, 50] as const;
const DONATION_TIERS = [
  { bps: 1000, label: '10 %', sublabel: 'Standard' },
  { bps: 1500, label: '15 %' },
  { bps: 2000, label: '20 %' },
  { bps: 2500, label: '25 %' },
] as const;

const MIN_AMOUNT_CENTS = 500;
const MAX_AMOUNT_CENTS = 50000;

interface Props {
  visible: boolean;
  walletAddress: string | null;
  buyerMode: BuyerMode;
  onClose: () => void;
  onStripeDismissed: () => void;
}

export default function TopUpBottomSheet({
  visible,
  walletAddress,
  buyerMode,
  onClose,
  onStripeDismissed,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('amount');
  const [selected, setSelected] = useState<Denomination | null>(
    buyerMode === 'sachbezug' ? 50 : null,
  );
  const [customAmount, setCustomAmount] = useState('');
  const [donationBps, setDonationBps] = useState(1000);
  const [showSachbezugChips, setShowSachbezugChips] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [vereine, setVereine] = useState<VereinOption[]>([]);
  const [vereineLoading, setVereineLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --- Derived state -------------------------------------------------------
  const amountCents = useMemo(() => {
    if (buyerMode === 'sachbezug') {
      // For sachbezug, selected is always one of the fixed denominations.
      return (typeof selected === 'number' ? selected : 50) * 100;
    }
    if (selected === null) return 0;
    if (selected === 'custom') {
      if (!customAmount) return 0;
      const parsed = parseFloat(customAmount.replace(',', '.'));
      if (!Number.isFinite(parsed)) return 0;
      return Math.round(parsed * 100);
    }
    return selected * 100;
  }, [selected, customAmount, buyerMode]);

  const amountValid =
    buyerMode === 'sachbezug'
      ? SACHBEZUG_DENOMINATIONS.includes(amountCents / 100 as any)
      : amountCents >= MIN_AMOUNT_CENTS && amountCents <= MAX_AMOUNT_CENTS;

  // Fee computation per mode.
  const feeBps = buyerMode === 'citizen' ? 0 : buyerMode === 'tourist' ? donationBps : 1000;
  const feeCents = Math.floor((amountCents * feeBps) / 10000);
  const vereineCents = Math.floor((amountCents * Math.floor(feeBps / 2)) / 10000);

  // For sachbezug, fee is deducted (card gets less); for others, fee on top.
  const cardCreditCents =
    buyerMode === 'sachbezug' ? amountCents - feeCents : amountCents;
  const totalCents =
    buyerMode === 'sachbezug' ? amountCents : amountCents + feeCents;

  const canAdvanceAmount = amountValid && !submitting;
  const canSubmit = amountValid && !submitting && walletAddress !== null;

  // --- Load Vereine once when sheet opens -----------------------------------
  useEffect(() => {
    if (!visible || vereine.length > 0 || vereineLoading) return;
    setVereineLoading(true);
    fetchVerifiedVereine()
      .then(setVereine)
      .finally(() => setVereineLoading(false));
  }, [visible, vereine.length, vereineLoading]);

  // Reset on mode change / close.
  const reset = useCallback(() => {
    setStep('amount');
    setSelected(buyerMode === 'sachbezug' ? 50 : null);
    setCustomAmount('');
    setDonationBps(1000);
    setShowSachbezugChips(false);
    setBeneficiaryId(null);
  }, [buyerMode]);

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
        feeMode: buyerMode,
        donationBps: buyerMode === 'tourist' ? donationBps : undefined,
      });
      await openRoebelCardCheckout(session.url);
      handleClose();
      onStripeDismissed();
    } catch (err: any) {
      Alert.alert(
        'Fehler',
        err?.message ?? 'Zahlung konnte nicht gestartet werden.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Sticky CTA config — always at the bottom of the sheet so it's reachable
  // regardless of scroll position or keyboard state.
  const ctaLabel =
    step === 'amount'
      ? 'Weiter'
      : submitting
        ? ''
        : `Weiter zu Stripe · ${formatEuros(totalCents)}`;
  const ctaOnPress = step === 'amount' ? handleAdvanceToVerein : handleSubmit;
  const ctaDisabled = step === 'amount' ? !canAdvanceAmount : !canSubmit;

  return (
    <BottomDrawer visible={visible} onClose={handleClose} maxSnapPoint={0.92}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kavContainer}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.sheetInner,
            {
              paddingBottom: Math.max(8, insets.bottom),
            },
          ]}
        >
          <View style={styles.headerRow}>
              {step === 'verein' ? (
                <Pressable
                  onPress={handleBackToAmount}
                  hitSlop={12}
                  style={styles.closeButton}
                >
                  <Text
                    style={[styles.backIcon, { color: colors.textPrimary }]}
                  >
                    {'‹'}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.closeButton} />
              )}
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {step === 'amount'
                  ? 'Röbel Card aufladen'
                  : 'Wer soll profitieren?'}
              </Text>
              <Pressable
                onPress={handleClose}
                hitSlop={12}
                style={styles.closeButton}
              >
                <Text
                  style={[styles.closeIcon, { color: colors.textSecondary }]}
                >
                  {'✕'}
                </Text>
              </Pressable>
            </View>

            {step === 'amount' ? (
              buyerMode === 'sachbezug' ? (
                <SachbezugAmountStep
                  colors={colors}
                  selected={typeof selected === 'number' ? selected : 50}
                  showChips={showSachbezugChips}
                  onToggleChips={() =>
                    setShowSachbezugChips((v) => !v)
                  }
                  onSelect={(d) => setSelected(d as Denomination)}
                  cardCreditCents={cardCreditCents}
                  feeCents={feeCents}
                  totalCents={totalCents}
                />
              ) : (
                <AmountStep
                  colors={colors}
                  buyerMode={buyerMode}
                  selected={selected}
                  customAmount={customAmount}
                  amountValid={amountValid}
                  cardCreditCents={cardCreditCents}
                  feeCents={feeCents}
                  totalCents={totalCents}
                  donationBps={donationBps}
                  onSelect={setSelected}
                  onCustomChange={setCustomAmount}
                  onDonationBpsChange={setDonationBps}
                />
              )
            ) : (
              <VereinStep
                colors={colors}
                vereine={vereine}
                vereineLoading={vereineLoading}
                beneficiaryId={beneficiaryId}
                onSelect={setBeneficiaryId}
              />
            )}

            {/* Sticky CTA — always visible at the bottom of the sheet,
                above the keyboard, regardless of scroll position. */}
            <Pressable
              onPress={ctaOnPress}
              disabled={ctaDisabled}
              style={[
                styles.payButton,
                { backgroundColor: colors.primary },
                ctaDisabled && { opacity: 0.4 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  style={[styles.payButtonText, { color: colors.onPrimary }]}
                >
                  {ctaLabel}
                </Text>
              )}
            </Pressable>

          {step === 'verein' && (
            <Text style={[styles.legal, { color: colors.textTertiary }]}>
              Du wirst zur sicheren Zahlung bei Stripe weitergeleitet.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </BottomDrawer>
  );
}

// ---------------------------------------------------------------------------
// Step 1a: Amount (citizen + tourist)
// ---------------------------------------------------------------------------

function AmountStep({
  colors,
  buyerMode,
  selected,
  customAmount,
  amountValid,
  cardCreditCents,
  feeCents,
  totalCents,
  donationBps,
  onSelect,
  onCustomChange,
  onDonationBpsChange,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  buyerMode: 'citizen' | 'tourist';
  selected: Denomination | null;
  customAmount: string;
  amountValid: boolean;
  cardCreditCents: number;
  feeCents: number;
  totalCents: number;
  donationBps: number;
  onSelect: (d: Denomination) => void;
  onCustomChange: (v: string) => void;
  onDonationBpsChange: (bps: number) => void;
}) {
  return (
    <ScrollView
      style={styles.amountScroll}
      contentContainerStyle={styles.amountScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {buyerMode === 'citizen'
          ? 'Wähle den Betrag, der auf deine Karte geladen wird.'
          : 'Der Nennwert wird deiner Karte gutgeschrieben. Zusätzlich fließt ein Förderanteil an einen Verein deiner Wahl oder den Röbeler Topf.'}
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
                  {
                    color: isSelected ? colors.onPrimary : colors.textPrimary,
                  },
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
            borderColor:
              selected === 'custom' ? colors.primary : colors.border,
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
            returnKeyType="done"
            onFocus={() => onSelect('custom')}
            style={[styles.customInput, { color: colors.textPrimary }]}
          />
          <Text
            style={[styles.customCurrency, { color: colors.textSecondary }]}
          >
            €
          </Text>
        </View>
      </Pressable>

      {selected === 'custom' && customAmount.length > 0 && !amountValid && (
        <Text
          style={[styles.helperError, { color: colors.error ?? '#DC2626' }]}
        >
          Betrag zwischen 5 € und 500 €.
        </Text>
      )}

      {/* Donation tier chips — tourist only */}
      {buyerMode === 'tourist' && amountValid && (
        <View style={styles.donationSection}>
          <Text style={[styles.donationLabel, { color: colors.textSecondary }]}>
            Förderanteil
          </Text>
          <View style={styles.donationRow}>
            {DONATION_TIERS.map((tier) => {
              const isActive = donationBps === tier.bps;
              return (
                <Pressable
                  key={tier.bps}
                  onPress={() => onDonationBpsChange(tier.bps)}
                  style={[
                    styles.donationChip,
                    {
                      borderColor: isActive ? colors.primary : colors.border,
                      backgroundColor: isActive
                        ? colors.primary
                        : colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.donationChipText,
                      {
                        color: isActive
                          ? colors.onPrimary
                          : colors.textPrimary,
                      },
                    ]}
                  >
                    {tier.label}
                  </Text>
                  {'sublabel' in tier && tier.sublabel && (
                    <Text
                      style={[
                        styles.donationChipSub,
                        {
                          color: isActive
                            ? colors.onPrimary
                            : colors.textTertiary,
                        },
                      ]}
                    >
                      {tier.sublabel}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Fee breakdown */}
      {amountValid && (
        <View style={[styles.breakdown, { backgroundColor: colors.surface }]}>
          <BreakdownRow
            label="Kartenguthaben"
            value={formatEuros(cardCreditCents)}
            colors={colors}
          />
          {feeCents > 0 && (
            <BreakdownRow
              label={`${donationBps / 100} % Förderanteil`}
              value={formatEuros(feeCents)}
              colors={colors}
            />
          )}
          <View
            style={[
              styles.breakdownDivider,
              { backgroundColor: colors.border },
            ]}
          />
          <BreakdownRow
            label="Gesamtbetrag"
            value={formatEuros(totalCents)}
            colors={colors}
            bold
          />
        </View>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 1b: Sachbezug amount (org accounts)
// ---------------------------------------------------------------------------

function SachbezugAmountStep({
  colors,
  selected,
  showChips,
  onToggleChips,
  onSelect,
  cardCreditCents,
  feeCents,
  totalCents,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  selected: number;
  showChips: boolean;
  onToggleChips: () => void;
  onSelect: (d: number) => void;
  cardCreditCents: number;
  feeCents: number;
  totalCents: number;
}) {
  return (
    <ScrollView
      style={styles.amountScroll}
      contentContainerStyle={styles.amountScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Big centered amount */}
      <View style={styles.sachbezugHero}>
        <Text style={[styles.sachbezugAmount, { color: colors.textPrimary }]}>
          {selected} €
        </Text>
        <Text style={[styles.sachbezugLabel, { color: colors.textSecondary }]}>
          Steuerfreier Sachbezug (§8 EStG)
        </Text>
      </View>

      {/* "Weniger" toggle */}
      <Pressable onPress={onToggleChips} hitSlop={8} style={styles.wenigerLink}>
        <Text style={[styles.wenigerText, { color: colors.primary }]}>
          {showChips ? 'Weniger ausblenden' : 'Weniger'}
        </Text>
      </Pressable>

      {/* Denomination chips (hidden until "Weniger" tapped) */}
      {showChips && (
        <View style={styles.sachbezugChips}>
          {SACHBEZUG_DENOMINATIONS.map((denom) => {
            const isSelected = selected === denom;
            return (
              <Pressable
                key={denom}
                onPress={() => onSelect(denom)}
                style={[
                  styles.sachbezugChip,
                  {
                    borderColor: isSelected
                      ? colors.primary
                      : colors.border,
                    backgroundColor: isSelected
                      ? colors.primary
                      : colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sachbezugChipText,
                    {
                      color: isSelected
                        ? colors.onPrimary
                        : colors.textPrimary,
                    },
                  ]}
                >
                  {denom} €
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Breakdown */}
      <View style={[styles.breakdown, { backgroundColor: colors.surface }]}>
        <BreakdownRow
          label="Kartenguthaben"
          value={formatEuros(cardCreditCents)}
          colors={colors}
        />
        <BreakdownRow
          label="Davon für Vereine"
          value={formatEuros(feeCents)}
          colors={colors}
        />
        <View
          style={[
            styles.breakdownDivider,
            { backgroundColor: colors.border },
          ]}
        />
        <BreakdownRow
          label="Gesamtbetrag"
          value={formatEuros(totalCents)}
          colors={colors}
          bold
        />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
// Step 2: Verein picker (shared across all modes)
// ---------------------------------------------------------------------------

function VereinStep({
  colors,
  vereine,
  vereineLoading,
  beneficiaryId,
  onSelect,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  vereine: VereinOption[];
  vereineLoading: boolean;
  beneficiaryId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Wähle, wer deinen lokalen Beitrag erhält. Den Röbeler Topf verteilen
        alle Bürger gemeinsam über Abstimmungen.
      </Text>

      <ScrollView
        style={styles.vereinList}
        contentContainerStyle={styles.vereinListContent}
      >
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
          <Text
            style={[styles.vereineEmpty, { color: colors.textTertiary }]}
          >
            Noch keine Vereine registriert. Dein Beitrag geht in den Röbeler
            Topf.
          </Text>
        )}
      </ScrollView>
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
        <Image
          source={{ uri: avatarUrl }}
          style={styles.vereinAvatar}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.vereinAvatar,
            styles.vereinAvatarPlaceholder,
            { backgroundColor: colors.border },
          ]}
        >
          <Text style={styles.vereinEmoji}>{emoji}</Text>
        </View>
      )}
      <View style={styles.vereinText}>
        <Text
          style={[styles.vereinName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {subtitle && (
          <Text
            style={[styles.vereinSubtitle, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
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
  // KAV + inner container — sits inside the BottomDrawer's content view.
  // The drawer itself handles the handle, backdrop, drag, and max height.
  kavContainer: {
    flexShrink: 1,
  },
  sheetInner: {
    gap: 12,
    flexShrink: 1,
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
  // Amount scroll — flexShrink: 1 lets the ScrollView shrink inside the
  // sheet's capped height so the sticky CTA stays visible. When content
  // fits, the ScrollView sizes to content. When it doesn't, the
  // ScrollView scrolls but the CTA remains fixed.
  amountScroll: {
    flexShrink: 1,
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

  // Donation tier chips (tourist)
  donationSection: {
    gap: 8,
    marginTop: 4,
  },
  donationLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  donationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  donationChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  donationChipText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  donationChipSub: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
  },

  // Sachbezug
  sachbezugHero: {
    alignItems: 'center',
    marginVertical: 16,
    gap: 8,
  },
  sachbezugAmount: {
    fontSize: 48,
    fontFamily: 'Inter-Bold',
  },
  sachbezugLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  wenigerLink: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  wenigerText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  sachbezugChips: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: 8,
  },
  sachbezugChip: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  sachbezugChipText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },

  // Breakdown
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

  // Verein picker — flexShrink so it shrinks to leave room for the sticky CTA.
  vereinList: {
    flexShrink: 1,
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
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  legal: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
});
