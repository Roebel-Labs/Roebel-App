import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateDealWizard } from '@/context/CreateDealWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';
import type { DealTypeChoice } from '@/context/CreateDealWizardContext';

const DEAL_TYPES: { value: DealTypeChoice; emoji: string; label: string; desc: string }[] = [
  { value: 'discount', emoji: '🏷️', label: 'Rabatt', desc: 'Prozentual oder fester Betrag' },
  { value: 'special', emoji: '⭐', label: 'Spezial', desc: 'Besonderes Angebot' },
  { value: 'event', emoji: '🎉', label: 'Event', desc: 'Veranstaltung oder Aktion' },
  { value: 'new_product', emoji: '🆕', label: 'Neues Produkt', desc: 'Neuheit vorstellen' },
];

export default function CreateDealTypeScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateDealWizard();
  const { colors } = useTheme();

  const [dealType, setDealType] = useState<DealTypeChoice | null>(state.dealType);

  const handleNext = () => {
    if (!dealType) return;
    dispatch({ type: 'SET_TYPE', payload: dealType });
    router.push('/create-deal/details');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>SCHRITT 1</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Was für ein Angebot?
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Wähle die Art deines Angebots.
        </Text>

        <View style={styles.grid}>
          {DEAL_TYPES.map((type) => {
            const selected = dealType === type.value;
            return (
              <Pressable
                key={type.value}
                onPress={() => setDealType(type.value)}
                style={[
                  styles.card,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                    borderWidth: 2,
                  },
                ]}
              >
                <Text style={styles.cardEmoji}>{type.emoji}</Text>
                <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{type.label}</Text>
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{type.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={1}
        totalSteps={5}
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={!dealType}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
  },
  cardEmoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  bottomSpacer: {
    height: 24,
  },
});
