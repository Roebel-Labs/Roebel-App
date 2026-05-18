/**
 * Revoke Membership Screen
 *
 * Lets the user request the revocation of an existing Attester or Citizen NFT.
 * Two modes:
 *   1. Self-revocation — relinquish your own role (needs other signers to approve).
 *   2. Target-revocation — only available to Attesters; flag someone else for removal.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useCreateRevocationRequest } from '@/hooks/useVerification';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ErrorDrawer from '@/components/ErrorDrawer';
import SuccessDrawer from '@/components/SuccessDrawer';

type Mode = 'self' | 'target';
type ContractType = 'attester' | 'citizen';

export default function RevokeMembershipScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { hasAttesterNFT, hasCitizenNFT, hasAnyNFT, refresh } = useVerificationContext();
  const { createRevocation, isLoading } = useCreateRevocationRequest();

  const initialMode: Mode = hasAttesterNFT ? 'target' : 'self';
  const [mode, setMode] = useState<Mode>(initialMode);

  const initialContract: ContractType =
    hasAttesterNFT && !hasCitizenNFT ? 'attester' : 'citizen';
  const [contractType, setContractType] = useState<ContractType>(initialContract);

  const [targetAddress, setTargetAddress] = useState('');
  const [reason, setReason] = useState('');

  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });
  const [successDrawer, setSuccessDrawer] = useState({ visible: false, message: '' });

  const target = mode === 'self' ? account?.address ?? '' : targetAddress.trim();

  const addressValid = useMemo(() => /^0x[a-fA-F0-9]{40}$/.test(target), [target]);
  const reasonValid = reason.trim().length >= 20;
  const canSubmit = !!account && addressValid && reasonValid && !isLoading;

  const requiredSignatures = contractType === 'attester' ? 2 : 1;
  const requiredSignaturesLabel =
    contractType === 'attester'
      ? '2 weitere Bescheiniger müssen die Entziehung bestätigen.'
      : '1 Bescheiniger muss die Entziehung bestätigen.';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const { requestId } = await createRevocation({
        contractType,
        target,
        reason: reason.trim(),
      });
      await refresh();
      setSuccessDrawer({
        visible: true,
        message: `Entziehungsantrag #${requestId} wurde eingereicht. ${requiredSignaturesLabel}`,
      });
      setReason('');
      setTargetAddress('');
    } catch (err) {
      setErrorDrawer({
        visible: true,
        message: err instanceof Error ? err.message : 'Antrag konnte nicht eingereicht werden.',
      });
    }
  };

  const closeAndBack = () => {
    setSuccessDrawer({ visible: false, message: '' });
    router.back();
  };

  if (!hasAnyNFT) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Header colors={colors} onBack={() => router.back()} />
        <View style={styles.emptyState}>
          <Ionicons name="information-circle-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Keine Mitgliedschaft
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Sie benötigen einen Bürger- oder Bescheiniger-Pass, um eine Entziehung zu beantragen.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Header colors={colors} onBack={() => router.back()} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.warning,
              { backgroundColor: colors.errorBackground, borderColor: colors.error },
            ]}
          >
            <Ionicons name="warning" size={20} color={colors.error} style={styles.warningIcon} />
            <Text style={[styles.warningText, { color: colors.error }]}>
              Eine bestätigte Entziehung verbrennt das NFT dauerhaft und entzieht die Stimmrechte
              im Governor. Verwenden Sie diese Funktion nur in begründeten Fällen.
            </Text>
          </View>

          {hasAttesterNFT ? (
            <Segmented
              colors={colors}
              options={[
                { value: 'target', label: 'Anderes Mitglied' },
                { value: 'self', label: 'Eigene Rolle' },
              ]}
              value={mode}
              onChange={(v) => setMode(v as Mode)}
            />
          ) : null}

          {hasAttesterNFT && hasCitizenNFT ? (
            <Segmented
              colors={colors}
              options={[
                { value: 'attester', label: 'Bescheiniger' },
                { value: 'citizen', label: 'Bürger' },
              ]}
              value={contractType}
              onChange={(v) => setContractType(v as ContractType)}
            />
          ) : null}

          {mode === 'self' ? (
            <Section title="EIGENE ROLLE ENTZIEHEN" colors={colors}>
              <View style={styles.cardBody}>
                <Text style={[styles.cardLead, { color: colors.textPrimary }]}>
                  Sie beantragen die Entziehung Ihres eigenen{' '}
                  {contractType === 'attester' ? 'Bescheiniger' : 'Bürger'}-Status.
                </Text>
                <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                  {requiredSignaturesLabel} Bis dahin bleibt Ihr NFT aktiv.
                </Text>
              </View>
            </Section>
          ) : (
            <Section title="ZIELMITGLIED" colors={colors}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Wallet-Adresse
                </Text>
                <TextInput
                  value={targetAddress}
                  onChangeText={setTargetAddress}
                  placeholder="0x…"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  style={[
                    styles.input,
                    {
                      color: colors.textPrimary,
                      borderColor:
                        targetAddress.length === 0
                          ? colors.borderSecondary
                          : addressValid
                            ? colors.borderSecondary
                            : colors.error,
                    },
                  ]}
                />
                {targetAddress.length > 0 && !addressValid ? (
                  <Text style={[styles.fieldError, { color: colors.error }]}>
                    Bitte eine gültige 0x-Adresse einfügen.
                  </Text>
                ) : null}
              </View>
            </Section>
          )}

          <Section title="BEGRÜNDUNG" colors={colors}>
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Diese Begründung wird verschlüsselt gespeichert und ist für die unterschreibenden
                Bescheiniger sichtbar.
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Mindestens 20 Zeichen, klare Begründung."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={5}
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { color: colors.textPrimary, borderColor: colors.borderSecondary },
                ]}
              />
              <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
                {reason.trim().length}/20
              </Text>
            </View>
          </Section>

          <Pressable
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={[
              styles.cta,
              {
                backgroundColor: canSubmit ? colors.error : colors.borderSecondary,
                opacity: canSubmit ? 1 : 0.7,
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Ionicons name="remove-circle-outline" size={18} color={colors.onPrimary} />
                <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>
                  Entziehungsantrag einreichen
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.footerNote, { color: colors.textTertiary }]}>
            Der Antrag wird onchain auf Base eingereicht. Gasgebühren werden über das
            Smart-Wallet abgewickelt.
          </Text>
        </ScrollView>
      </TouchableWithoutFeedback>

      <ErrorDrawer
        visible={errorDrawer.visible}
        message={errorDrawer.message}
        onDismiss={() => setErrorDrawer({ visible: false, message: '' })}
      />

      <SuccessDrawer
        visible={successDrawer.visible}
        message={successDrawer.message}
        primaryButtonText="Schließen"
        onPrimaryAction={closeAndBack}
        onDismiss={() => setSuccessDrawer({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

function Header({
  colors,
  onBack,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  onBack: () => void;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
        Mitgliedschaft verwalten
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
  colors,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segment,
              active ? { backgroundColor: colors.primary } : null,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                { color: active ? colors.onPrimary : colors.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-Medium' },
  headerSpacer: { width: 40 },

  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningIcon: { marginRight: 10, marginTop: 1 },
  warningText: { flex: 1, fontSize: 13, fontFamily: 'Inter-Medium', lineHeight: 18 },

  segmented: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  segmentLabel: { fontSize: 14, fontFamily: 'Inter-Medium' },

  sectionContainer: { paddingHorizontal: 16, paddingTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: { borderRadius: 12, overflow: 'hidden' },

  cardBody: { paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  cardLead: { fontSize: 15, fontFamily: 'Inter-Medium', lineHeight: 20 },
  cardHint: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },

  fieldRow: { paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  fieldError: { fontSize: 12, fontFamily: 'Inter-Regular' },
  fieldHint: { fontSize: 12, fontFamily: 'Inter-Regular', alignSelf: 'flex-end' },
  input: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputMultiline: { minHeight: 110, textAlignVertical: 'top' },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaLabel: { fontSize: 15, fontFamily: 'Inter-Medium' },

  footerNote: {
    marginHorizontal: 16,
    marginTop: 16,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
    textAlign: 'center',
  },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  emptyBody: { fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
});
