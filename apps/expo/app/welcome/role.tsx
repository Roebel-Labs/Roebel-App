import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWelcomeWizard, PreferredRole } from '@/context/WelcomeWizardContext';
import { useUser } from '@/context/UserContext';
import { isSingleStep } from '@/lib/profile-completion';
import { updateUserOnboarding } from '@/lib/supabase-users';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

const ROLES: { value: PreferredRole; image: ImageSourcePropType; label: string; desc: string }[] = [
  {
    value: 'buerger',
    image: require('../../assets/illustration/onboarding/buerger.png'),
    label: 'Bürger:in',
    desc: 'Ich wohne in Röbel.',
  },
  {
    value: 'tourist',
    image: require('../../assets/illustration/onboarding/suitcase.png'),
    label: 'Besucher:in',
    desc: 'Ich besuche Röbel.',
  },
  {
    value: 'organisation',
    image: require('../../assets/illustration/small/services.png'),
    label: 'Organisation',
    desc: 'Ich führe ein Unternehmen oder einen Verein in Röbel.',
  },
];

export default function WelcomeRoleScreen() {
  const router = useRouter();
  const { state, dispatch } = useWelcomeWizard();
  const { colors } = useTheme();
  // Opened from the profile's "Profil vervollständigen" card: save this one step and go back.
  const single = isSingleStep(useLocalSearchParams<{ single?: string }>().single);
  const { user, refreshUser } = useUser();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveSingle = async () => {
    if (!state.preferredRole || !user?.wallet_address || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateUserOnboarding(user.wallet_address, { preferredRole: state.preferredRole });
      await refreshUser();
      router.back();
    } catch {
      setSaveError('Deine Auswahl konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!single && <StoryProgress step={2} totalSteps={state.preferredRole === 'buerger' ? 4 : 3} />}
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Was trifft auf dich zu?</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Wir zeigen dir passende Funktionen. Du kannst die Auswahl später ändern.
        </Text>

        <View style={styles.list}>
          {ROLES.map((role) => {
            const selected = state.preferredRole === role.value;
            return (
              <Pressable
                key={role.value}
                onPress={() => dispatch({ type: 'SET_ROLE', payload: role.value })}
                style={[
                  styles.card,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                    borderWidth: 2,
                  },
                ]}
              >
                <Image source={role.image} style={styles.cardImage} resizeMode="contain" accessibilityIgnoresInvertColors />
                <View style={styles.cardText}>
                  <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{role.label}</Text>
                  <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{role.desc}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {saveError && <Text style={[styles.error, { color: colors.error }]}>{saveError}</Text>}
      <WizardFooter
        onBack={() => router.back()}
        onNext={() => {
          if (single) {
            void saveSingle();
            return;
          }
          if (state.preferredRole) {
            router.push((state.preferredRole === 'buerger' ? '/welcome/citizen-data' : '/welcome/consent') as any);
          }
        }}
        nextLabel={single ? 'Speichern' : 'Weiter'}
        nextDisabled={!state.preferredRole || saving}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  error: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  heading: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
    lineHeight: 22,
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    padding: 20,
  },
  cardImage: {
    width: 48,
    height: 48,
  },
  cardText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
