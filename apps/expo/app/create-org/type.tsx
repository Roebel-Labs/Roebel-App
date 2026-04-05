import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateOrgWizard, OrgTypeChoice } from '@/context/CreateOrgWizardContext';

const ORG_TYPES: { value: OrgTypeChoice; emoji: string; label: string; desc: string }[] = [
  { value: 'restaurant', emoji: '🍽️', label: 'Restaurant', desc: 'Gastronomie mit Speisekarte' },
  { value: 'unternehmen', emoji: '🏪', label: 'Unternehmen', desc: 'Gewerbe & Dienstleistungen' },
  { value: 'verein', emoji: '🤝', label: 'Verein', desc: 'Sport, Kultur, Soziales' },
  { value: 'partei', emoji: '🏛️', label: 'Partei', desc: 'Politische Parteien' },
  { value: 'fraktion', emoji: '⚖️', label: 'Fraktion', desc: 'Fraktionen im Stadtrat' },
];

export default function CreateOrgTypeScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateOrgWizard();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <Text className="text-sm font-inter-medium text-text-secondary mb-2">SCHRITT 1</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">
          Welcher Typ beschreibt dich am besten?
        </Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Wähle den passenden Typ für deine Organisation.
        </Text>

        <View className="flex-row flex-wrap gap-3">
          {ORG_TYPES.map((org) => {
            const selected = state.orgType === org.value;
            return (
              <Pressable
                key={org.value}
                onPress={() => dispatch({ type: 'SET_ORG_TYPE', payload: org.value })}
                className={`w-[48%] rounded-2xl p-4 border-2 ${selected ? 'border-primary bg-surface' : 'border-border bg-surface'}`}
              >
                <Text className="text-3xl mb-2">{org.emoji}</Text>
                <Text className="text-base font-inter-medium text-text-primary">{org.label}</Text>
                <Text className="text-xs font-inter-regular text-text-secondary mt-1">{org.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3">
        <Pressable onPress={() => router.back()} className="py-4 px-6">
          <Text className="text-base font-inter-medium text-text-secondary">Zurück</Text>
        </Pressable>
        <Pressable
          onPress={() => state.orgType && router.push('/create-org/info')}
          disabled={!state.orgType}
          className={`bg-primary rounded-xl py-4 px-8 ${!state.orgType ? 'opacity-50' : ''}`}
        >
          <Text className="text-on-primary text-base font-inter-medium">Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
