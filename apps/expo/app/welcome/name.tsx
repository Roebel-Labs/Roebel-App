import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

export default function WelcomeNameScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useWelcomeWizard();
  const [name, setName] = useState(state.name);

  const commit = (nextName: string) => {
    dispatch({ type: 'SET_NAME', payload: nextName });
  };

  const handleNext = () => {
    commit(name.trim());
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
        <StoryProgress step={1} totalSteps={3} />
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Wie heißt du?</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Dein Name erscheint auf deinem Profil. Du kannst ihn später jederzeit ändern.
        </Text>

        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            value={name}
            onChangeText={setName}
            placeholder="Dein Name"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={handleNext}
          />
        </View>

        <Pressable onPress={handleSkip} style={styles.skipButton} accessibilityRole="button">
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Überspringen</Text>
        </Pressable>
      </KeyboardAwareScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={handleNext}
        nextLabel="Weiter"
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
    marginBottom: 16,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
