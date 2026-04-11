// Step 2 — Rechtsform + USt-IdNr.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { usePartnerRegisterWizard } from '@/context/PartnerRegisterWizardContext';
import {
  RECHTSFORM_LABELS,
  type Rechtsform,
} from '@/lib/supabase-roebel-card-partners';
import WizardFooter from '@/components/WizardFooter';

const RECHTSFORM_OPTIONS: Rechtsform[] = [
  'einzelunternehmen',
  'gbr',
  'ug',
  'gmbh',
  'gmbh_co_kg',
  'ag',
  'ev',
  'ek',
  'ohg',
  'kg',
  'sonstige',
];

const VAT_ID_REGEX = /^DE\d{9}$/i;

export default function PartnerRegisterInfoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = usePartnerRegisterWizard();

  const [rechtsform, setRechtsform] = useState<Rechtsform | null>(state.rechtsform);
  const [vatId, setVatId] = useState(state.vatId);
  const [showPicker, setShowPicker] = useState(false);

  const vatIdValid = vatId.trim() === '' || VAT_ID_REGEX.test(vatId.trim());
  const canContinue = rechtsform !== null && vatIdValid;

  const handleNext = () => {
    if (!canContinue || !rechtsform) return;
    dispatch({ type: 'SET_INFO', payload: { rechtsform, vatId: vatId.trim() } });
    router.push('/roebel-card/partner-register/bank' as any);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 2 von 5</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Dein Betrieb</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Wir brauchen die Rechtsform für den Partnervertrag. Die USt-IdNr ist freiwillig.
        </Text>

        {/* Rechtsform picker */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Rechtsform *</Text>
        <Pressable
          onPress={() => setShowPicker(true)}
          style={[
            styles.pickerRow,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <Text
            style={[
              styles.pickerValue,
              { color: rechtsform ? colors.textPrimary : colors.textTertiary },
            ]}
          >
            {rechtsform ? RECHTSFORM_LABELS[rechtsform] : 'Rechtsform auswählen'}
          </Text>
          <Text style={[styles.pickerChevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>

        {/* USt-IdNr input */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}>
          USt-IdNr
        </Text>
        <TextInput
          value={vatId}
          onChangeText={setVatId}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DE123456789"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.textInput,
            {
              borderColor: vatIdValid ? colors.border : colors.error ?? '#DC2626',
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />
        {!vatIdValid && (
          <Text style={[styles.helperError, { color: colors.error ?? '#DC2626' }]}>
            Ungültige USt-IdNr (Format: DE + 9 Ziffern)
          </Text>
        )}
        <Text style={[styles.helper, { color: colors.textTertiary }]}>
          Freiwillig. Du brauchst keine USt-IdNr, um Partner zu werden.
        </Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={2}
        totalSteps={5}
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={!canContinue}
      />

      {/* Rechtsform selection modal */}
      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowPicker(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.background }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Rechtsform</Text>
            <ScrollView style={styles.modalList}>
              {RECHTSFORM_OPTIONS.map((option) => {
                const selected = rechtsform === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      setRechtsform(option);
                      setShowPicker(false);
                    }}
                    style={[
                      styles.modalOption,
                      { borderBottomColor: colors.border },
                      selected && { backgroundColor: colors.primaryLight ?? colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        { color: selected ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {RECHTSFORM_LABELS[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 32 },
  label: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  pickerValue: { fontSize: 15, fontFamily: 'Inter-Regular' },
  pickerChevron: {
    fontSize: 20,
    transform: [{ rotate: '90deg' }],
    marginRight: 4,
  },
  textInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  helper: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  helperError: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  bottomSpacer: { height: 96 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalList: { paddingHorizontal: 16 },
  modalOption: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
