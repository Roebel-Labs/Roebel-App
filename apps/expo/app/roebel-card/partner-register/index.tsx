// Röbel Card partner registration — intro (step 0).
// Mirrors app/create-org/index.tsx.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

const STEPS = [
  { emoji: '🏪', title: 'Dein Betrieb', desc: 'Rechtsform und optionale USt-IdNr' },
  { emoji: '🏦', title: 'Bankverbindung', desc: 'IBAN für monatliche Auszahlungen' },
  { emoji: '✅', title: 'AGB bestätigen', desc: 'Kurzer Vertragsabschluss per Klick' },
];

export default function PartnerRegisterIntroScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Röbel Card{'\n'}Partner werden
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          In wenigen Schritten registrierst du deinen Betrieb, um Röbel Card Zahlungen
          entgegenzunehmen.
        </Text>

        <View style={styles.stepsContainer}>
          {STEPS.map((step, i) => (
            <View key={i} style={[styles.stepCard, { borderColor: colors.border }]}>
              <Text style={styles.stepEmoji}>{step.emoji}</Text>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
                  {`${i + 1}. ${step.title}`}
                </Text>
                <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/roebel-card/partner-register/business' as any)}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Los geht's</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 40,
  },
  stepsContainer: {
    gap: 12,
    marginBottom: 48,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  stepEmoji: {
    fontSize: 22,
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
