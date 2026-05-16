import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

const STEPS = [
  {
    title: 'Antrag stellen',
    desc: 'Name und Adresse werden mit Ende-zu-Ende-Verschlüsselung gesichert.',
    icon: require('@/assets/illustration/small/encryption.png'),
  },
  {
    title: 'Digitale Unterschriften einholen',
    desc: 'Holen Sie zwei Unterschriften von weiteren Bürgern ein.',
    icon: require('@/assets/illustration/small/signatures.png'),
  },
  {
    title: 'Verifiziert',
    desc: 'Sie können nun an Bürgerumfragen anonym teilnehmen.',
    icon: require('@/assets/illustration/small/verification-badge.png'),
  },
];

export default function VerifyCitizenIntroScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Image
        source={require('@/assets/illustration/buergerumfragen.png')}
        style={styles.hero}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />

      <SafeAreaView style={styles.heroOverlay} edges={['top']} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeButton, { backgroundColor: colors.background }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.contentArea} edges={['left', 'right', 'bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            So einfach ist die{'\n'}Verifizierung
          </Text>

          <View style={styles.stepsContainer}>
            {STEPS.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepIconBox}>
                  <Image source={step.icon} style={styles.stepIcon} resizeMode="contain" />
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => router.push('/verification/request-citizen/form' as any)}
            style={[styles.button, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Los geht's</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    width: '100%',
    height: 320,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  contentArea: {
    flex: 1,
    marginTop: 320,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  heading: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 34,
    marginBottom: 24,
  },
  stepsContainer: { gap: 20 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  stepIconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIcon: { width: 36, height: 36 },
  stepText: { flex: 1 },
  stepTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  footer: { paddingHorizontal: 24, paddingBottom: 8, paddingTop: 12 },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
});
