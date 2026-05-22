import React from 'react';
import { View, Text, Pressable, StyleSheet, ImageBackground, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';

export default function WelcomeIntroScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  // Apple Sign in policy: name/email already provided by Authentication
  // Services framework — don't prompt for it again.
  const skipNameStep = user?.auth_provider === 'apple';

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
            onPress={() => router.push((skipNameStep ? '/welcome/role' : '/welcome/name') as any)}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Loslegen</Text>
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
    textAlign: 'center',
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
});
