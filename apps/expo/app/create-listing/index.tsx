import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import type { ListingTypeChoice } from '@/context/CreateListingWizardContext';
import ExitWizardSheet from '@/components/ExitWizardSheet';

export default function CreateListingIntroScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [showExit, setShowExit] = useState(false);
  const { dispatch } = useCreateListingWizard();
  const params = useLocalSearchParams<{
    listingType?: string;
    accountId?: string;
  }>();

  const hasTypeParam = params.listingType === 'product' || params.listingType === 'service';
  const isService = params.listingType === 'service';

  const STEPS = [
    {
      title: 'Beschreibe dein Angebot',
      desc: 'Kategorie, Titel und Fotos',
      illustration: isService
        ? require('@/assets/illustration/small/services.png')
        : require('@/assets/illustration/small/product-listing.png'),
    },
    {
      title: 'Setze deinen Preis',
      desc: 'Festpreis, VB oder zu verschenken',
      illustration: require('@/assets/illustration/small/sale-tag.png'),
    },
    {
      title: 'Werde sichtbar',
      desc: 'Sofort im Marktplatz für alle sichtbar',
      illustration: require('@/assets/illustration/small/mecky-thumbs-up.png'),
    },
  ];

  // Pre-set type and account from route params (org-originated flows).
  useEffect(() => {
    if (params.accountId) {
      dispatch({ type: 'SET_ACCOUNT_ID', payload: params.accountId });
    }
    if (hasTypeParam) {
      dispatch({
        type: 'SET_TYPE',
        payload: { listingType: params.listingType as ListingTypeChoice, category: null },
      });
    }
  }, [params.accountId, params.listingType, hasTypeParam]);

  const handlePick = (choice: ListingTypeChoice) => {
    dispatch({ type: 'SET_TYPE', payload: { listingType: choice, category: null } });
    router.push('/create-listing/type');
  };

  const headerAndExit = (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={() => setShowExit(true)} style={styles.closeButton}>
          <Text style={[styles.closeIcon, { color: colors.textPrimary }]}>✕</Text>
        </Pressable>
      </View>
      <ExitWizardSheet
        visible={showExit}
        onDelete={() => {
          dispatch({ type: 'RESET' });
          setShowExit(false);
          router.back();
        }}
        onSaveAndExit={() => {
          setShowExit(false);
          router.back();
        }}
        onCancel={() => setShowExit(false)}
      />
    </>
  );

  if (!hasTypeParam) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {headerAndExit}
        <View style={styles.content}>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            Was möchtest du{'\n'}inserieren?
          </Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            Du kannst ein Produkt zum Verkauf oder eine Dienstleistung anbieten.
          </Text>

          <View style={styles.pickerRow}>
            <Pressable
              onPress={() => handlePick('product')}
              style={({ pressed }) => [
                styles.pickerCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Produkt verkaufen"
            >
              <Image
                source={require('@/assets/illustration/small/product-listing.png')}
                style={styles.pickerIllustration}
                resizeMode="contain"
              />
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Produkt</Text>
              <Text style={[styles.pickerDesc, { color: colors.textSecondary }]}>
                Etwas verkaufen oder verschenken
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handlePick('service')}
              style={({ pressed }) => [
                styles.pickerCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Dienstleistung anbieten"
            >
              <Image
                source={require('@/assets/illustration/small/services.png')}
                style={styles.pickerIllustration}
                resizeMode="contain"
              />
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Dienstleistung</Text>
              <Text style={[styles.pickerDesc, { color: colors.textSecondary }]}>
                Eine Leistung anbieten
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {headerAndExit}
      <View style={styles.content}>
        <View>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            So einfach erstellst du{'\n'}eine Anzeige
          </Text>

          <View style={styles.stepsContainer}>
            {STEPS.map((step, i) => (
              <View
                key={i}
                style={[
                  styles.stepRow,
                  i < STEPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.stepNumber, { color: colors.textPrimary }]}>{i + 1}</Text>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
                </View>
                <View style={styles.stepIllustrationBox}>
                  <Image source={step.illustration} style={styles.stepIllustration} resizeMode="contain" />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/create-listing/type')}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Los geht's</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerRow: { paddingHorizontal: 24, paddingTop: 8 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 20, fontFamily: 'Inter-Regular' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  heading: { fontSize: 32, fontFamily: 'Inter-Bold', marginBottom: 12, lineHeight: 38 },
  subheading: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 32, lineHeight: 22 },
  pickerRow: { flexDirection: 'row', gap: 12 },
  pickerCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  pickerIllustration: { width: 96, height: 96, marginBottom: 12 },
  pickerTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  pickerDesc: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 18 },
  stepsContainer: {},
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  stepNumber: { fontSize: 16, fontFamily: 'Inter-SemiBold', width: 24, alignSelf: 'flex-start', paddingTop: 4 },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 17, fontFamily: 'Inter-Medium' },
  stepDesc: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 4, lineHeight: 19 },
  stepIllustrationBox: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
  stepIllustration: { width: 80, height: 80 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  button: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold'},
});
