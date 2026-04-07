import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import CheckIcon from '@/assets/icons/check.svg';
import { useTheme } from '@/context/ThemeContext';

export default function CreateDealSuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.successBackground }]}>
          <CheckIcon width={32} height={32} color={colors.success} />
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Dein Angebot wurde erstellt!
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Dein Angebot ist jetzt sichtbar. Du kannst es jederzeit in deinem Dashboard bearbeiten.
        </Text>

        <Pressable
          onPress={() => router.replace('/org/ads')}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Zu meinen Anzeigen</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
