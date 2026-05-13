import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';
import ListingCategoryIcon from '@/components/ListingCategoryIcon';
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from '@/constants/listing-categories';

export default function CreateListingTypeScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateListingWizard();
  const { colors } = useTheme();

  const [category, setCategory] = useState<string | null>(state.category);

  useEffect(() => {
    if (!state.listingType) {
      router.replace('/create-listing');
    }
  }, [state.listingType]);

  const isService = state.listingType === 'service';
  const categories = isService ? SERVICE_CATEGORIES : PRODUCT_CATEGORIES;
  const heading = isService ? 'Was bietest du an?' : 'Was möchtest du verkaufen?';
  const subheading = isService
    ? 'Wähle eine Kategorie für deine Dienstleistung.'
    : 'Wähle eine Kategorie für deine Anzeige.';

  const handleNext = () => {
    if (!state.listingType || !category) return;
    dispatch({ type: 'SET_TYPE', payload: { listingType: state.listingType, category } });
    router.push('/create-listing/details');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <StoryProgress step={1} totalSteps={6} />
        <Text style={[styles.heading, { color: colors.textPrimary }]}>{heading}</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>{subheading}</Text>

        <View style={styles.grid}>
          {categories.map((cat) => {
            const selected = category === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setCategory(cat.key)}
                style={[
                  styles.card,
                  { backgroundColor: selected ? colors.primaryLight : colors.surface },
                ]}
              >
                <ListingCategoryIcon
                  name={cat.icon}
                  size={28}
                  color={selected ? colors.primary : colors.textPrimary}
                />
                <Text
                  style={[
                    styles.cardLabel,
                    { color: selected ? colors.primary : colors.textPrimary },
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={!category}
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
    gap: 8,
  },
  cardLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  bottomSpacer: {
    height: 24,
  },
});
