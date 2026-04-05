import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import { geocodeLocation } from '@/lib/utils/geocoding';
import WizardFooter from '@/components/WizardFooter';

export default function CreateOrgLocationScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { state, dispatch } = useCreateOrgWizard();

  const [address, setAddress] = useState(state.address);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoded, setGeocoded] = useState(!!state.formattedAddress);

  const apiKey = (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const mapboxToken = (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

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

  const handleSaveLocation = () => {
    if (!geocoded && address.trim()) {
      handleGeocode();
    }
  };

  const handleNext = () => {
    if (!geocoded) {
      dispatch({ type: 'SET_LOCATION', payload: { address: address.trim(), latitude: null, longitude: null, formattedAddress: null } });
    }
    router.push('/create-org/contact');
  };

  // Build static map URL when geocoded
  const mapStyle = isDark ? 'dark-v11' : 'light-v11';
  const staticMapUrl = geocoded && state.latitude && state.longitude && mapboxToken
    ? `https://api.mapbox.com/styles/v1/mapbox/${mapStyle}/static/pin-s+194383(${state.longitude},${state.latitude})/${state.longitude},${state.latitude},14,0/600x300@2x?access_token=${mapboxToken}`
    : null;

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

        {/* Map preview */}
        <View style={styles.mapContainer}>
          {staticMapUrl ? (
            <View style={[styles.mapWrapper, { borderColor: colors.border }]}>
              <Image
                source={{ uri: staticMapUrl }}
                style={styles.mapImage}
                resizeMode="cover"
              />
            </View>
          ) : (
            <View style={[styles.mapFallback, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.mapFallbackEmoji}>🗺️</Text>
              <Text style={[styles.mapFallbackText, { color: colors.textTertiary }]}>
                Kartenvorschau erscheint nach Adresseingabe
              </Text>
            </View>
          )}
        </View>

        {/* Skip option */}
        <Pressable onPress={handleNext} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: colors.textTertiary }]}>Adresse später hinzufügen</Text>
        </Pressable>
      </ScrollView>

      <WizardFooter
        step={3}
        onBack={() => router.back()}
        onNext={geocoded ? handleNext : handleSaveLocation}
        nextLabel={geocoded ? 'Weiter' : 'Ort speichern'}
        nextDisabled={!address.trim() && !geocoded}
        nextContent={isGeocoding ? <ActivityIndicator color={colors.onPrimary} /> : undefined}
      />
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
  mapContainer: {
    marginTop: 20,
  },
  mapWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  mapImage: {
    width: '100%',
    height: 180,
  },
  mapFallback: {
    borderRadius: 16,
    borderWidth: 1,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFallbackEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  mapFallbackText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  skipButton: {
    marginTop: 20,
    marginBottom: 24,
  },
  skipText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
