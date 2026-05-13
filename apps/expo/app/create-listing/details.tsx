import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

export default function CreateListingDetailsScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateListingWizard();
  const { colors } = useTheme();

  const [title, setTitle] = useState(state.title);
  const [description, setDescription] = useState(state.description);

  const handleNext = () => {
    if (!title.trim()) return;
    dispatch({ type: 'SET_DETAILS', payload: { title: title.trim(), description: description.trim() } });
    router.push('/create-listing/pricing');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <StoryProgress step={2} totalSteps={6} />
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            Erzähl uns mehr
          </Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            Beschreibe dein Angebot so gut wie möglich.
          </Text>

          {/* Title field */}
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            Titel <Text style={{ color: colors.error }}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
            placeholder="Was bietest du an?"
            placeholderTextColor={colors.textTertiary}
            maxLength={TITLE_MAX}
            returnKeyType="next"
          />
          <Text style={[styles.charCounter, { color: colors.textTertiary }]}>
            {title.length}/{TITLE_MAX}
          </Text>

          {/* Description field */}
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Beschreibung</Text>
          <TextInput
            style={[
              styles.input,
              styles.multilineInput,
              {
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, DESCRIPTION_MAX))}
            placeholder="Beschreibe deinen Artikel oder deine Dienstleistung..."
            placeholderTextColor={colors.textTertiary}
            maxLength={DESCRIPTION_MAX}
            multiline
            textAlignVertical="top"
          />
          <Text style={[styles.charCounter, { color: colors.textTertiary }]}>
            {description.length}/{DESCRIPTION_MAX}
          </Text>

          {/* Bottom spacer for scroll */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        <WizardFooter
          onBack={() => router.back()}
          onNext={handleNext}
          nextDisabled={!title.trim()}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
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
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  multilineInput: {
    minHeight: 120,
  },
  charCounter: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 24,
  },
  bottomSpacer: {
    height: 24,
  },
});
