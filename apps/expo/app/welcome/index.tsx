import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ImageBackground, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import LoginDrawer from '@/components/LoginDrawer';
import PasskeyEntryLinks from '@/components/passkey/PasskeyEntryLinks';
import PasskeySignInOption from '@/components/passkey/PasskeySignInOption';
import { deferWelcomeWizard } from '@/lib/onboarding-deferral';

/**
 * Welcome screen.
 *  - Logged in (pushed by UserContext for a row without onboarding): "Loslegen" into the wizard.
 *  - Logged out (first launch while the passkey gate is open, see app/consent.tsx): the passkey
 *    "Unabhängiges Konto" comes FIRST, then the thirdweb login and "Erst mal umsehen". A new
 *    passkey account lands in the app right away; the wizard steps wait on the profile card.
 */
export default function WelcomeIntroScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const account = useActiveAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  // Apple Sign in policy: name/email already provided by Authentication
  // Services framework — don't prompt for it again.
  const skipNameStep = user?.auth_provider === 'apple';

  const loggedOut = !account;
  // welcome is a full-screen modal over home: leaving it returns to home.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  };
  // A login that happens ON this screen (passkey or thirdweb) continues from home: UserContext
  // then shows the wizard for a new thirdweb account, or nothing for a deferred passkey account.
  const wasLoggedOut = useRef(loggedOut);
  useEffect(() => {
    if (loggedOut) {
      wasLoggedOut.current = true;
      return;
    }
    if (wasLoggedOut.current) {
      wasLoggedOut.current = false;
      setLoginOpen(false);
      leave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedOut]);

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
          <Text style={[styles.headline, loggedOut && styles.headlineCompact]}>Willkommen{'\n'}in Röbel</Text>
        </View>

        {loggedOut ? (
          <View style={[styles.card, styles.cardScrollable, { backgroundColor: colors.background }]}>
            <ScrollView
              contentContainerStyle={[styles.cardContent, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.cardHeadlineSmall, { color: colors.textPrimary }]}>
                Röbel neu erleben{'\n'}und mitgestalten
              </Text>

              {/* Renders nothing unless the passkey gate is open. */}
              <PasskeySignInOption
                initiallyOpen
                beforeActivate={(kind, session) => {
                  if (kind === 'signUp') deferWelcomeWizard(session.identity);
                }}
              />

              <Pressable
                onPress={() => setLoginOpen(true)}
                style={[styles.secondaryButton, { borderColor: colors.primary }]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Mit E-Mail, Google oder Apple anmelden</Text>
              </Pressable>

              <Pressable onPress={leave} style={styles.textButton} accessibilityRole="button">
                <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Erst mal umsehen</Text>
              </Pressable>

              <PasskeyEntryLinks />
            </ScrollView>
          </View>
        ) : (
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
            <PasskeyEntryLinks />
          </View>
        )}
      </ImageBackground>

      {loggedOut && <LoginDrawer visible={loginOpen} onClose={() => setLoginOpen(false)} hidePasskey />}
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
  headlineCompact: {
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -0.8,
  },
  card: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
  },
  cardScrollable: {
    maxHeight: '78%',
    padding: 0,
  },
  cardContent: {
    padding: 24,
    paddingTop: 28,
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
  cardHeadlineSmall: {
    fontFamily: 'Inter-Medium',
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: 20,
  },
  primaryButton: {
    marginTop: 32,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 16,
    textAlign: 'center',
  },
  textButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  textButtonLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
