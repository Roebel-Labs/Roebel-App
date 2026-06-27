// Partner registration — success screen.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function PartnerRegisterSuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
          <Text style={styles.iconText}>✓</Text>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Antrag eingereicht</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Wir prüfen deinen Antrag. Du erhältst eine Benachrichtigung, sobald dein Betrieb
          als Röbel Card Partner freigeschaltet wird.
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace('/roebel-card/partner' as any)}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            Zum Partner Dashboard
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/profile' as any)}
          style={styles.secondaryButton}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
            Zur Profilseite
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 40,
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 8,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
