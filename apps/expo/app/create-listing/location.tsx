import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';

export default function CreateListingLocationScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateListingWizard();
  const { colors } = useTheme();

  const [neighborhood, setNeighborhood] = useState(state.neighborhood);

  const handleNext = () => {
    dispatch({ type: 'SET_LOCATION', payload: neighborhood });
    router.push('/create-listing/review');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>SCHRITT 5</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Wo ist dein Angebot?
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Optional: Gib einen Standort oder Stadtteil an.
        </Text>

        <Text style={[styles.label, { color: colors.textPrimary }]}>Standort</Text>
        <TextInput
          value={neighborhood}
          onChangeText={setNeighborhood}
          placeholder="z.B. R\u00F6bel Zentrum"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={5}
        totalSteps={6}
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  bottomSpacer: {
    height: 24,
  },
});
