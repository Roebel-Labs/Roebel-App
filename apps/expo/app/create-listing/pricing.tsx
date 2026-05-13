import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import type { PriceTypeChoice, ConditionChoice } from '@/context/CreateListingWizardContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

const PRICE_TYPES: { key: PriceTypeChoice; label: string }[] = [
  { key: 'fixed', label: 'Festpreis' },
  { key: 'negotiable', label: 'VB' },
  { key: 'free', label: 'Zu verschenken' },
];

const CONDITIONS: { key: ConditionChoice; label: string }[] = [
  { key: 'neu', label: 'Neu' },
  { key: 'wie_neu', label: 'Wie neu' },
  { key: 'gut', label: 'Gut' },
  { key: 'akzeptabel', label: 'Akzeptabel' },
];

export default function PricingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateListingWizard();

  const [priceType, setPriceType] = useState<PriceTypeChoice>(state.priceType);
  const [price, setPrice] = useState(state.price);
  const [condition, setCondition] = useState<ConditionChoice | null>(state.condition);

  const handleNext = () => {
    dispatch({
      type: 'SET_PRICING',
      payload: {
        priceType,
        price: priceType === 'free' ? '' : price,
        condition: state.listingType === 'service' ? null : condition,
      },
    });
    router.push('/create-listing/photos');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <StoryProgress step={3} totalSteps={6} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Preis & Zustand</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Lege deinen Preis fest und beschreibe den Zustand.
        </Text>

        {/* Price type chips */}
        <View style={styles.chipRow}>
          {PRICE_TYPES.map((pt) => {
            const selected = priceType === pt.key;
            return (
              <Pressable
                key={pt.key}
                onPress={() => setPriceType(pt.key)}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? colors.primary : colors.surface },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? colors.onPrimary : colors.textPrimary },
                  ]}
                >
                  {pt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Price input - hidden when free */}
        {priceType !== 'free' && (
          <View style={styles.inputSection}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Preis (€)</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                },
              ]}
            />
          </View>
        )}

        {/* Condition chips - hidden for services */}
        {state.listingType !== 'service' && (
          <View style={styles.conditionSection}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Zustand</Text>
            <View style={styles.chipRow}>
              {CONDITIONS.map((c) => {
                const selected = condition === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCondition(c.key)}
                    style={[
                      styles.chip,
                      { backgroundColor: selected ? colors.primary : colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.onPrimary : colors.textPrimary },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={handleNext}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  title: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  textInput: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  conditionSection: {
    marginBottom: 24,
  },
});
