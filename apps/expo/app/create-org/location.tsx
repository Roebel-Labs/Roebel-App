import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
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

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 3</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">Wo befindet ihr euch?</Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Gib eure Adresse ein — wir finden die genauen Koordinaten automatisch.
        </Text>

        <Text className={`text-xs font-inter-medium mb-2 uppercase tracking-wider ${geocoded ? 'text-green-600 dark:text-green-400' : 'text-text-secondary'}`}>
          {geocoded ? 'Adresse ✓' : 'Adresse'}
        </Text>

        {/* Address input — changes to success state when geocoded */}
        <View className={`rounded-xl px-4 py-3.5 flex-row items-center gap-3 ${
          geocoded
            ? 'bg-green-50 dark:bg-green-950 border-2 border-green-500 dark:border-green-400'
            : geocodeError
              ? 'bg-red-50 dark:bg-red-950 border-2 border-red-500 dark:border-red-400'
              : 'bg-surface border border-border'
        }`}>
          <Text className="text-base">📍</Text>
          <View className="flex-1">
            {geocoded && state.formattedAddress ? (
              <>
                <Text className="text-sm font-inter-medium text-text-primary">{state.formattedAddress}</Text>
                <Text className="text-xs font-inter-regular text-text-tertiary mt-0.5">
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
                className="text-base font-inter-regular text-text-primary p-0"
              />
            )}
          </View>
          {isGeocoding && <ActivityIndicator size="small" color={colors.primary} />}
          {geocoded && <Text className="text-green-600 dark:text-green-400 text-lg">✓</Text>}
        </View>

        {/* Error message */}
        {geocodeError && (
          <Text className="text-xs font-inter-regular text-red-600 dark:text-red-400 mt-2">{geocodeError}</Text>
        )}

        {/* Tap to edit when geocoded */}
        {geocoded && (
          <Pressable onPress={() => { setGeocoded(false); setAddress(state.formattedAddress || address); }} className="mt-3">
            <Text className="text-xs font-inter-medium text-primary text-center">Adresse ändern</Text>
          </Pressable>
        )}

        {/* Skip option */}
        <Pressable onPress={handleNext} className="mt-6">
          <Text className="text-sm font-inter-regular text-text-tertiary text-center underline">Adresse später hinzufügen</Text>
        </Pressable>
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3 border-t border-border">
        <Pressable onPress={() => router.back()} className="py-4 px-6">
          <Text className="text-base font-inter-medium text-text-secondary">Zurück</Text>
        </Pressable>
        <Pressable onPress={handleNext} className="bg-primary rounded-xl py-4 px-8">
          <Text className="text-on-primary text-base font-inter-medium">Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
