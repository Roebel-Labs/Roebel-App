import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';
import type { ListingTypeChoice } from '@/context/CreateListingWizardContext';

const LISTING_TYPES: { value: ListingTypeChoice; emoji: string; label: string; desc: string }[] = [
  { value: 'product', emoji: '📦', label: 'Produkt', desc: 'Artikel zum Verkauf oder Verschenken' },
  { value: 'service', emoji: '🛠️', label: 'Dienstleistung', desc: 'Service oder Hilfe anbieten' },
];

const CATEGORIES: { key: string; emoji: string; label: string }[] = [
  { key: 'moebel', emoji: '🛋️', label: 'Möbel' },
  { key: 'elektronik', emoji: '💻', label: 'Elektronik' },
  { key: 'kleidung', emoji: '👕', label: 'Kleidung' },
  { key: 'fahrzeuge', emoji: '🚗', label: 'Fahrzeuge' },
  { key: 'sport', emoji: '⚽', label: 'Sport' },
  { key: 'garten', emoji: '🌿', label: 'Garten' },
  { key: 'haushalt', emoji: '🏠', label: 'Haushalt' },
  { key: 'spielzeug', emoji: '🧸', label: 'Spielzeug' },
  { key: 'buecher', emoji: '📚', label: 'Bücher' },
  { key: 'dienstleistungen', emoji: '🤝', label: 'Dienstleistungen' },
  { key: 'immobilien', emoji: '🏘️', label: 'Immobilien' },
  { key: 'sonstiges', emoji: '📋', label: 'Sonstiges' },
];

export default function CreateListingTypeScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateListingWizard();
  const { colors } = useTheme();

  const [listingType, setListingType] = useState<ListingTypeChoice | null>(state.listingType);
  const [category, setCategory] = useState<string | null>(state.category);

  const handleNext = () => {
    if (!listingType || !category) return;
    dispatch({ type: 'SET_TYPE', payload: { listingType, category } });
    router.push('/create-listing/details');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>SCHRITT 1</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Was bietest du an?
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Wähle den Typ und eine Kategorie für deine Anzeige.
        </Text>

        {/* Listing type selection */}
        <View style={styles.grid}>
          {LISTING_TYPES.map((type) => {
            const selected = listingType === type.value;
            return (
              <Pressable
                key={type.value}
                onPress={() => setListingType(type.value)}
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

        {/* Category selection — shown after type is selected */}
        {listingType && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kategorie</Text>
            <View style={styles.grid}>
              {CATEGORIES.map((cat) => {
                const selected = category === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => setCategory(cat.key)}
                    style={[
                      styles.card,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: colors.surface,
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <Text style={styles.cardEmoji}>{cat.emoji}</Text>
                    <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{cat.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Bottom spacer for scroll */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={1}
        totalSteps={6}
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={!listingType || !category}
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
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginTop: 32,
    marginBottom: 16,
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
