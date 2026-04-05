import React, { useState } from 'react';
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

  const handleGeocode = async () => {
    if (!address.trim()) return;
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
  };

  const handleAddressChange = (text: string) => {
    setAddress(text);
    setGeocoded(false);
    setGeocodeError(null);
  };

  const handleNext = () => {
    if (!geocoded) {
      // Allow skipping for non-business orgs
      dispatch({ type: 'SET_LOCATION', payload: { address: address.trim(), latitude: null, longitude: null, formattedAddress: null } });
    }
    router.push('/create-org/contact');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text className="text-sm font-inter-medium text-text-secondary mb-2">SCHRITT 3</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">Wo befindet ihr euch?</Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Die Adresse wird nur nach Freigabe mit Gästen geteilt.
        </Text>

        <Text className="text-xs font-inter-medium text-text-secondary mb-2 uppercase tracking-wider">Adresse</Text>
        <TextInput
          value={address}
          onChangeText={handleAddressChange}
          placeholder="Straße, Hausnummer, PLZ Ort"
          placeholderTextColor={colors.textTertiary}
          className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-3"
        />

        <Pressable
          onPress={handleGeocode}
          disabled={isGeocoding || !address.trim()}
          className={`bg-surface rounded-xl py-3.5 items-center mb-4 border border-border ${!address.trim() ? 'opacity-50' : ''}`}
        >
          {isGeocoding ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text className="text-base font-inter-medium text-primary">Adresse prüfen</Text>
          )}
        </Pressable>

        {/* Success card */}
        {geocoded && state.formattedAddress && (
          <View className="bg-green-50 dark:bg-green-950 rounded-xl p-4 mb-4">
            <Text className="text-sm font-inter-medium text-green-800 dark:text-green-200 mb-1">Adresse gefunden</Text>
            <Text className="text-base font-inter-regular text-green-700 dark:text-green-300">{state.formattedAddress}</Text>
          </View>
        )}

        {/* Error message */}
        {geocodeError && (
          <View className="bg-red-50 dark:bg-red-950 rounded-xl p-4 mb-4">
            <Text className="text-sm font-inter-regular text-red-700 dark:text-red-300">{geocodeError}</Text>
          </View>
        )}
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3">
        <Pressable onPress={() => router.back()} className="py-4 px-6">
          <Text className="text-base font-inter-medium text-text-secondary">Zurück</Text>
        </Pressable>
        <Pressable
          onPress={handleNext}
          className="bg-primary rounded-xl py-4 px-8"
        >
          <Text className="text-on-primary text-base font-inter-medium">Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
