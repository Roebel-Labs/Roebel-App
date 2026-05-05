import React from 'react';
import { View, Text, Pressable, StyleSheet, ImageBackground, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/context/ThemeContext';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';

export default function WelcomeIntroScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { openExit } = useWelcomeWizard();

  const certImage = isDark
    ? require('../../assets/illustration/onboarding/cert-dark-mode.png')
    : require('../../assets/illustration/onboarding/cert-light-mode.png');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ImageBackground
        source={require('../../assets/illustration/onboarding/roebel-bg.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={[styles.headlineWrap, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.headline}>Willkommen{'\n'}in Röbel</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.background, paddingBottom: insets.bottom + 32 }]}>
          <Image source={certImage} style={styles.cert} resizeMode="contain" accessibilityIgnoresInvertColors />

          <Text style={[styles.cardHeadline, { color: colors.textPrimary }]}>
            Röbel neu erleben{'\n'}und mitgestalten
          </Text>

          <Pressable
            onPress={() => router.push('/welcome/name' as any)}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Loslegen</Text>
          </Pressable>

          <Pressable onPress={openExit} style={styles.textButton} accessibilityRole="button">
            <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Zurück zur Startseite</Text>
          </Pressable>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  background: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headlineWrap: {
    paddingHorizontal: 24,
  },
  headline: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    fontSize: 60,
    lineHeight: 64,
    letterSpacing: -1.2,
  },
  card: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
  },
  cert: {
    height: 56,
    width: '100%',
    alignSelf: 'center',
  },
  cardHeadline: {
    marginTop: 8,
    fontFamily: 'Inter-Medium',
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 32,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  textButton: {
    marginTop: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
});
