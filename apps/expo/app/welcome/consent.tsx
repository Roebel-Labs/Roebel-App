import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useConsent } from '@/context/ConsentContext';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';
import { updateUserOnboarding } from '@/lib/supabase-users';
import { setNotificationPromptPending } from '@/lib/onboarding-storage';

const AGB_URL = 'https://www.roebel.app/agb';
const DATENSCHUTZ_URL = 'https://www.roebel.app/datenschutz';

export default function WelcomeConsentScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, refreshUser } = useUser();
  const { acceptAll, acceptEssential } = useConsent();
  const { state, dispatch } = useWelcomeWizard();
  const [submitting, setSubmitting] = useState(false);

  const dismissToProfile = () => {
    dispatch({ type: 'RESET' });
    router.replace('/profile');
  };

  const handleAccept = async () => {
    if (!user?.wallet_address) {
      await acceptAll('welcome_terms');
      await setNotificationPromptPending();
      router.replace('/');
      return;
    }
    setSubmitting(true);
    try {
      await updateUserOnboarding(user.wallet_address, {
        username: state.name ? state.name : undefined,
        preferredRole: state.preferredRole ?? undefined,
        termsAccepted: true,
        markCompleted: true,
      });
      await acceptAll('welcome_terms');
      await refreshUser();
      await setNotificationPromptPending();
      dispatch({ type: 'RESET' });
      router.replace('/');
    } catch (err) {
      console.error('Failed to save onboarding consent:', err);
      Alert.alert('Fehler', 'Deine Zustimmung konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (user?.wallet_address) {
      try {
        await updateUserOnboarding(user.wallet_address, {
          username: state.name ? state.name : undefined,
          preferredRole: state.preferredRole ?? undefined,
          markCompleted: true,
        });
        await refreshUser();
      } catch (err) {
        console.error('Failed to persist declined onboarding:', err);
      }
    }
    await acceptEssential('welcome_terms');
    dismissToProfile();
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open URL:', err);
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('../../assets/icons/Heart.png')}
          style={styles.illustration}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Unsere Gemeinschaft</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Röbel ist eine Gemeinschaft, in der alle willkommen sind.
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Um diese App zu nutzen, bitten wir dich um dein Einverständnis zu folgendem:
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Ich behandle alle Mitglieder der Röbel-Gemeinschaft — unabhängig von Herkunft, Religion,
          Nationalität, Hautfarbe, Beeinträchtigung, Geschlecht, Geschlechtsidentität, sexueller
          Orientierung oder Alter — mit Respekt und ohne Vorurteile.
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Mit „Akzeptieren" stimme ich den folgenden Dokumenten zu:
        </Text>

        <View style={styles.linksRow}>
          <Pressable onPress={() => openUrl(AGB_URL)} accessibilityRole="link">
            <Text style={[styles.link, { color: colors.primary }]}>AGB</Text>
          </Pressable>
          <Text style={[styles.linkSep, { color: colors.textTertiary }]}>·</Text>
          <Pressable onPress={() => openUrl(DATENSCHUTZ_URL)} accessibilityRole="link">
            <Text style={[styles.link, { color: colors.primary }]}>Datenschutz</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={handleAccept}
          disabled={submitting}
          style={[styles.acceptButton, { backgroundColor: colors.primary }, submitting && { opacity: 0.6 }]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.acceptText, { color: colors.onPrimary }]}>Akzeptieren</Text>
          )}
        </Pressable>
        <Pressable onPress={handleDecline} disabled={submitting} style={styles.declineButton}>
          <Text style={[styles.declineText, { color: colors.textSecondary }]}>Ablehnen</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  illustration: {
    width: 56,
    height: 56,
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  heading: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    lineHeight: 32,
    marginBottom: 24,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 16,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  link: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    textDecorationLine: 'underline',
  },
  linkSep: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    gap: 8,
  },
  acceptButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  declineButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  declineText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
