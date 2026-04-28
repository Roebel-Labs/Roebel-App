import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

const STEPS = [
  {
    title: 'Antrag stellen',
    desc: 'Name und Adresse werden mit End-zu-Ende-Verschlüsselung gesichert.',
    illustration: require('@/assets/illustration/small/encryption.png'),
  },
  {
    title: 'Digitale Unterschriften einholen',
    desc: 'Holen Sie zwei Unterschriften von weiteren Bürgern ein.',
    illustration: require('@/assets/illustration/small/signatures.png'),
  },
  {
    title: 'Verifiziert',
    desc: 'Sie können nun an Bürgerumfragen anonym teilnehmen.',
    illustration: require('@/assets/illustration/small/verification-badge.png'),
  },
];

export default function VerifyCitizenIntroScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={[styles.closeIcon, { color: colors.textPrimary }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        <View>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            So einfach ist die{'\n'}Verifizierung
          </Text>

          <View style={styles.stepsContainer}>
            {STEPS.map((step, i) => (
              <View
                key={i}
                style={[
                  styles.stepRow,
                  i < STEPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.stepNumber, { color: colors.textPrimary }]}>{i + 1}</Text>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
                </View>
                <View style={styles.stepIllustrationBox}>
                  <Image source={step.illustration} style={styles.stepIllustration} resizeMode="contain" />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/verification/request-citizen/form' as any)}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Loslegen</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerRow: { paddingHorizontal: 24, paddingTop: 8 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 20, fontFamily: 'Inter-Regular' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  heading: { fontSize: 32, fontFamily: 'Inter-Bold', marginBottom: 32, lineHeight: 38 },
  stepsContainer: {},
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  stepNumber: { fontSize: 16, fontFamily: 'Inter-SemiBold', width: 24, alignSelf: 'flex-start', paddingTop: 4 },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 17, fontFamily: 'Inter-Medium' },
  stepDesc: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 4, lineHeight: 19 },
  stepIllustrationBox: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
  stepIllustration: { width: 80, height: 80 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  button: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
