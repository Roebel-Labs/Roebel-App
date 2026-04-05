import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const STEPS = [
  { num: '1', title: 'Wähle deinen Typ', desc: 'Restaurant, Verein, Partei oder Unternehmen' },
  { num: '2', title: 'Erstelle dein Profil', desc: 'Name, Beschreibung, Fotos und Kontakt' },
  { num: '3', title: 'Werde sichtbar', desc: 'Nach Freigabe erscheint dein Profil in der App' },
];

export default function CreateOrgIntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 justify-center">
        <Text className="text-3xl font-inter-bold text-text-primary mb-2">
          Organisation erstellen
        </Text>
        <Text className="text-base font-inter-regular text-text-secondary mb-10">
          In wenigen Schritten erstellst du dein Profil in Röbel.
        </Text>

        <View className="gap-6 mb-12">
          {STEPS.map((step) => (
            <View key={step.num} className="flex-row items-start gap-4">
              <View className="w-8 h-8 rounded-full bg-primary items-center justify-center">
                <Text className="text-on-primary text-sm font-inter-bold">{step.num}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-inter-medium text-text-primary">{step.title}</Text>
                <Text className="text-sm font-inter-regular text-text-secondary mt-1">{step.desc}</Text>
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
