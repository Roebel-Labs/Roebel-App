import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateDealWizard } from '@/context/CreateDealWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

export default function CreateDealScheduleScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateDealWizard();
  const { colors } = useTheme();

  const [startDate, setStartDate] = useState(state.startDate);
  const [endDate, setEndDate] = useState(state.endDate);
  const [status, setStatus] = useState<'draft' | 'active'>(state.status);

  const handleNext = () => {
    dispatch({
      type: 'SET_SCHEDULE',
      payload: { startDate, endDate, status },
    });
    router.push('/create-deal/review');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <StoryProgress step={4} totalSteps={5} />
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            Zeitraum & Status
          </Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            Wann soll dein Angebot gelten?
          </Text>

          {/* Start date */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>VON</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="Startdatum (TT.MM.JJJJ)"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="next"
          />
          <View style={styles.fieldSpacer} />

          {/* End date */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BIS</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="Enddatum (TT.MM.JJJJ)"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
          />
          <View style={styles.fieldSpacer} />

          {/* Status toggle */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>STATUS</Text>
          <View style={styles.pillRow}>
            <Pressable
              onPress={() => setStatus('draft')}
              style={[
                styles.pill,
                status === 'draft'
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: status === 'draft' ? colors.onPrimary : colors.textPrimary },
                ]}
              >
                Entwurf
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setStatus('active')}
              style={[
                styles.pill,
                status === 'active'
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: status === 'active' ? colors.onPrimary : colors.textPrimary },
                ]}
              >
                Sofort aktiv
              </Text>
            </Pressable>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <WizardFooter
          onBack={() => router.back()}
          onNext={handleNext}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  heading: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  fieldSpacer: {
    height: 24,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pill: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  bottomSpacer: {
    height: 24,
  },
});
