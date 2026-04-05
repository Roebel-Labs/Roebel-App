import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import { geocodeLocation } from '@/lib/utils/geocoding';

export default function CreateOrgLocationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateOrgWizard();

  const [address, setAddress] = useState(state.address);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoded, setGeocoded] = useState(!!state.formattedAddress);

  const apiKey = (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const handleGeocode = useCallback(async () => {
    if (!address.trim() || isGeocoding) return;
    setIsGeocoding(true);
    setGeocodeError(null);

    try {
      const result = await geocodeLocation(address.trim(), apiKey);
      if (result) {
        dispatch({
          type: 'SET_LOCATION',
          payload: {
            address: address.trim(),
            latitude: result.latitude,
            longitude: result.longitude,
            formattedAddress: result.formatted_address,
          },
        });
        setGeocoded(true);
      } else {
        setGeocodeError('Adresse nicht gefunden. Bitte versuche eine genauere Eingabe.');
      }
    } catch {
      setGeocodeError('Fehler bei der Adresssuche. Bitte versuche es erneut.');
    } finally {
      setIsGeocoding(false);
    }
  }, [address, apiKey, isGeocoding, dispatch]);

  const handleAddressChange = (text: string) => {
    setAddress(text);
    setGeocoded(false);
    setGeocodeError(null);
  };

  const handleNext = () => {
    if (!geocoded) {
      dispatch({ type: 'SET_LOCATION', payload: { address: address.trim(), latitude: null, longitude: null, formattedAddress: null } });
    }
    router.push('/create-org/contact');
  };

  const inputBoxStyle = geocoded
    ? { backgroundColor: colors.successBackground, borderWidth: 2, borderColor: colors.success }
    : geocodeError
      ? { backgroundColor: colors.errorBackground, borderWidth: 2, borderColor: colors.error }
      : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 3</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Wo befindet ihr euch?</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Gib eure Adresse ein — wir finden die genauen Koordinaten automatisch.
        </Text>

        <Text style={[styles.fieldLabel, geocoded ? { color: colors.success } : { color: colors.textSecondary }]}>
          {geocoded ? 'Adresse ✓' : 'Adresse'}
        </Text>

        {/* Address input — changes to success state when geocoded */}
        <View style={[styles.inputBox, inputBoxStyle]}>
          <Text style={styles.pinEmoji}>📍</Text>
          <View style={styles.inputInner}>
            {geocoded && state.formattedAddress ? (
              <>
                <Text style={[styles.formattedAddress, { color: colors.textPrimary }]}>{state.formattedAddress}</Text>
                <Text style={[styles.coords, { color: colors.textTertiary }]}>
                  {state.latitude?.toFixed(4)}° N, {state.longitude?.toFixed(4)}° O
                </Text>
              </>
            ) : (
              <TextInput
                value={address}
                onChangeText={handleAddressChange}
                onBlur={handleGeocode}
                onSubmitEditing={handleGeocode}
                placeholder="z.B. Marktplatz 1, Röbel..."
                placeholderTextColor={colors.textTertiary}
                returnKeyType="search"
                style={[styles.textInput, { color: colors.textPrimary }]}
              />
            )}
          </View>
          {isGeocoding && <ActivityIndicator size="small" color={colors.primary} />}
          {geocoded && <Text style={[styles.checkmark, { color: colors.success }]}>✓</Text>}
        </View>

        {/* Error message */}
        {geocodeError && (
          <Text style={[styles.errorText, { color: colors.error }]}>{geocodeError}</Text>
        )}

        {/* Tap to edit when geocoded */}
        {geocoded && (
          <Pressable onPress={() => { setGeocoded(false); setAddress(state.formattedAddress || address); }} style={styles.changeAddressButton}>
            <Text style={[styles.changeAddressText, { color: colors.primary }]}>Adresse ändern</Text>
          </Pressable>
        )}

        {/* Skip option */}
        <Pressable onPress={handleNext} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: colors.textTertiary }]}>Adresse später hinzufügen</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { borderTopWidth: 1, borderTopColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.textSecondary }]}>Zurück</Text>
        </Pressable>
        <Pressable onPress={handleNext} style={[styles.nextButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.nextText, { color: colors.onPrimary }]}>Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 13,
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
  inputBox: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pinEmoji: {
    fontSize: 14,
  },
  inputInner: {
    flex: 1,
  },
  formattedAddress: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  coords: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  textInput: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    padding: 0,
  },
  checkmark: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
  },
  changeAddressButton: {
    marginTop: 12,
  },
  changeAddressText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  skipButton: {
    marginTop: 24,
  },
  skipText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  nextButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  nextText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
