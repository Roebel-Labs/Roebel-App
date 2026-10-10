import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';
import { isSingleStep } from '@/lib/profile-completion';
import { updateUserOnboarding } from '@/lib/supabase-users';
import { ensureUniqueUsernameSlug, slugifyDisplayName } from '@/lib/username-slug';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

// Display names: letters (incl. ä/ö/ü/ß), spaces, hyphens, apostrophes.
// Must start with a letter. 2–40 chars total.
const DISPLAY_NAME_REGEX = /^\p{L}[\p{L}\p{M}'\- ]{1,39}$/u;

export default function WelcomeNameScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useWelcomeWizard();
  const [displayName, setDisplayName] = useState(state.displayName);
  // Opened from the profile's "Profil vervollständigen" card: save this one step and go back.
  const single = isSingleStep(useLocalSearchParams<{ single?: string }>().single);
  const { user, refreshUser } = useUser();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const trimmed = displayName.replace(/\s+/g, ' ').trim();
  const nameValid = DISPLAY_NAME_REGEX.test(trimmed);
  const showHint = trimmed.length > 0 && !nameValid;

  const commit = (nextName: string) => {
    dispatch({ type: 'SET_DISPLAY_NAME', payload: nextName });
  };

  const saveSingle = async () => {
    if (!nameValid || !user?.wallet_address || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      let username: string | undefined;
      if (!user.username) {
        // users.username_length CHECK requires 3-30 chars; an existing username is never replaced.
        const slug = await ensureUniqueUsernameSlug(slugifyDisplayName(trimmed), user.wallet_address).catch(() => '');
        if (slug.length >= 3) username = slug;
      }
      await updateUserOnboarding(user.wallet_address, { displayName: trimmed, username });
      await refreshUser();
      router.back();
    } catch {
      setSaveError('Dein Name konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (single) {
      void saveSingle();
      return;
    }
    if (trimmed.length > 0 && !nameValid) return;
    commit(trimmed);
    router.push('/welcome/role' as any);
  };

  const handleSkip = () => {
    commit('');
    router.push('/welcome/role' as any);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        showsVerticalScrollIndicator={false}
      >
        {!single && <StoryProgress step={1} totalSteps={state.preferredRole === 'buerger' ? 5 : 4} />}
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Wie heißt du?</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Dein Name erscheint auf deinem Profil. Du kannst ihn später jederzeit ändern.
        </Text>

        <View
          style={[
            styles.inputContainer,
            { backgroundColor: colors.surface, borderColor: showHint ? colors.error : colors.borderSecondary },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="z. B. Max Brych"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleNext}
          />
        </View>

        {showHint && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Buchstaben, Leerzeichen, Bindestrich oder Apostroph, 2–40 Zeichen.
          </Text>
        )}

        {saveError && <Text style={[styles.hint, { color: colors.error }]}>{saveError}</Text>}

        {!single && (
          <Pressable onPress={handleSkip} style={styles.skipButton} accessibilityRole="button">
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Überspringen</Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={handleNext}
        nextLabel={single ? 'Speichern' : 'Weiter'}
        nextDisabled={single ? !nameValid || saving : showHint}
      />
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
  inputContainer: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  hint: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  skipButton: {
    alignSelf: 'center',
    paddingVertical: 16,
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textDecorationLine: 'underline',
  },
});
