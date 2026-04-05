import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const STEPS = [
  { emoji: '🏪', title: 'Wähle deinen Typ', desc: 'Restaurant, Verein, Partei oder Unternehmen' },
  { emoji: '✏️', title: 'Erstelle dein Profil', desc: 'Name, Beschreibung, Fotos und Kontakt' },
  { emoji: '🚀', title: 'Werde sichtbar', desc: 'Nach Freigabe erscheint dein Profil in der App' },
];

export default function CreateOrgIntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 justify-center">
        <Text className="text-3xl font-inter-bold text-text-primary mb-2">
          Werde sichtbar{'\n'}in Röbel
        </Text>
        <Text className="text-base font-inter-regular text-text-secondary mb-10">
          In wenigen Schritten erstellst du dein Profil.
        </Text>

        <View className="gap-3 mb-12">
          {STEPS.map((step, i) => (
            <View key={i} className="flex-row items-center gap-4 border border-border rounded-2xl p-4">
              <Text className="text-3xl">{step.emoji}</Text>
              <View className="flex-1">
                <Text className="text-sm font-inter-semibold text-text-primary">{`${i + 1}. ${step.title}`}</Text>
                <Text className="text-xs font-inter-regular text-text-secondary mt-0.5">{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="px-6 pb-6">
        <Pressable
          onPress={() => router.push('/create-org/type')}
          className="bg-primary rounded-xl py-4 items-center"
        >
          <Text className="text-on-primary text-base font-inter-medium">Los geht's</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
