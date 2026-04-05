import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import type { OpeningHours } from '@/lib/types';

const DAYS: { key: keyof OpeningHours; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '18:00';

export default function CreateOrgContactScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch, needsCategory } = useCreateOrgWizard();

  const [phone, setPhone] = useState(state.phone);
  const [email, setEmail] = useState(state.email);
  const [website, setWebsite] = useState(state.website);
  const [showHours, setShowHours] = useState(!!state.openingHours);
  const [hours, setHours] = useState<OpeningHours>(state.openingHours || {});

  const updateDay = (day: keyof OpeningHours, field: 'open' | 'close' | 'closed', value: any) => {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], open: prev[day]?.open || DEFAULT_OPEN, close: prev[day]?.close || DEFAULT_CLOSE, [field]: value },
    }));
  };

  const handleNext = () => {
    dispatch({
      type: 'SET_CONTACT',
      payload: {
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        openingHours: showHours ? hours : null,
      },
    });
    router.push('/create-org/photos');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text className="text-sm font-inter-medium text-text-secondary mb-2">SCHRITT 4</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">Kontakt & Öffnungszeiten</Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Wie können Besucher dich erreichen?
        </Text>

        {/* Phone */}
        <Text className="text-xs font-inter-medium text-text-secondary mb-2 uppercase tracking-wider">Telefon</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="z.B. 039931 12345"
          placeholderTextColor={colors.textTertiary}
          keyboardType="phone-pad"
          className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-5"
        />

        {/* Email */}
        <Text className="text-xs font-inter-medium text-text-secondary mb-2 uppercase tracking-wider">E-Mail</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="kontakt@beispiel.de"
          placeholderTextColor={colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-5"
        />

        {/* Website */}
        <Text className="text-xs font-inter-medium text-text-secondary mb-2 uppercase tracking-wider">Website</Text>
        <TextInput
          value={website}
          onChangeText={setWebsite}
          placeholder="www.beispiel.de"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-5"
        />

        {/* Opening hours (conditional) */}
        {needsCategory && (
          <>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-inter-medium text-text-primary">Öffnungszeiten angeben</Text>
              <Switch
                value={showHours}
                onValueChange={setShowHours}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            {showHours && DAYS.map(({ key, label }) => {
              const day = hours[key];
              const isClosed = day?.closed ?? false;

              return (
                <View key={key} className="flex-row items-center justify-between py-3 border-b border-border">
                  <View className="w-24">
                    <Text className={`text-sm font-inter-regular ${isClosed ? 'text-text-tertiary' : 'text-text-primary'}`}>{label}</Text>
                  </View>
                  {isClosed ? (
                    <Text className="text-sm font-inter-regular text-text-tertiary flex-1 text-center">Geschlossen</Text>
                  ) : (
                    <View className="flex-row items-center gap-2 flex-1 justify-center">
                      <TextInput
                        value={day?.open || DEFAULT_OPEN}
                        onChangeText={(v) => updateDay(key, 'open', v)}
                        placeholder="09:00"
                        placeholderTextColor={colors.textTertiary}
                        className="bg-surface rounded-lg px-3 py-2 text-sm font-inter-regular text-text-primary w-16 text-center"
                      />
                      <Text className="text-text-secondary text-sm">–</Text>
                      <TextInput
                        value={day?.close || DEFAULT_CLOSE}
                        onChangeText={(v) => updateDay(key, 'close', v)}
                        placeholder="18:00"
                        placeholderTextColor={colors.textTertiary}
                        className="bg-surface rounded-lg px-3 py-2 text-sm font-inter-regular text-text-primary w-16 text-center"
                      />
                    </View>
                  )}
                  <Pressable onPress={() => updateDay(key, 'closed', !isClosed)} className="ml-2">
                    <Text className="text-xs font-inter-medium text-primary">{isClosed ? 'Öffnen' : 'Zu'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        <View className="h-24" />
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3">
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
