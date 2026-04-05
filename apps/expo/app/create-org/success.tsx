import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import CheckIcon from '@/assets/icons/check.svg';
import { useTheme } from '@/context/ThemeContext';

export default function CreateOrgSuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center items-center px-8">
        <View className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 items-center justify-center mb-6">
          <CheckIcon width={32} height={32} color={colors.success || '#065F46'} />
        </View>

        <Text className="text-2xl font-inter-bold text-text-primary text-center mb-3">
          Dein Antrag wurde eingereicht!
        </Text>

        <Text className="text-base font-inter-regular text-text-secondary text-center leading-6 mb-10">
          Du wirst benachrichtigt, sobald dein Antrag von der Verwaltung genehmigt wurde. Dein Profil erscheint dann in der App.
        </Text>

        <Pressable
          onPress={() => router.replace('/profile')}
          className="bg-primary rounded-xl py-4 px-10"
        >
          <Text className="text-on-primary text-base font-inter-medium">Zurück zum Profil</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
