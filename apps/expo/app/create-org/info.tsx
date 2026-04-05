import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import type { BusinessCategory } from '@/lib/types';
import WizardFooter from '@/components/WizardFooter';

const CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: 'gastronomie', label: 'Gastronomie' },
  { value: 'einzelhandel', label: 'Einzelhandel' },
  { value: 'handwerk', label: 'Handwerk' },
  { value: 'dienstleistung', label: 'Dienstleistung' },
  { value: 'gesundheit', label: 'Gesundheit' },
  { value: 'bildung', label: 'Bildung' },
  { value: 'kultur', label: 'Kultur' },
  { value: 'sport', label: 'Sport' },
  { value: 'tourismus', label: 'Tourismus' },
  { value: 'immobilien', label: 'Immobilien' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

export default function CreateOrgInfoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch, needsCategory } = useCreateOrgWizard();

  const [name, setName] = useState(state.name);
  const [description, setDescription] = useState(state.description);
  const [category, setCategory] = useState<BusinessCategory | null>(state.category);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const selectedLabel = CATEGORIES.find(c => c.value === category)?.label || 'Kategorie wählen';
  const canProceed = name.trim().length > 0;

  const handleNext = () => {
    dispatch({ type: 'SET_INFO', payload: { name: name.trim(), description: description.trim(), category } });
    router.push('/create-org/location');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 2</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Erzähl uns mehr</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Wie heißt deine Organisation und was macht sie aus?
        </Text>

        {/* Name */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name deiner Organisation"
          placeholderTextColor={colors.textTertiary}
          maxLength={100}
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
        />
        <Text style={[styles.counter, { color: colors.textTertiary }]}>{name.length}/100</Text>

        {/* Description */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Beschreibung</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Was macht deine Organisation besonders?"
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          style={[styles.input, styles.inputMultiline, { backgroundColor: colors.surface, color: colors.textPrimary }]}
        />
        <Text style={[styles.counter, { color: colors.textTertiary }]}>{description.length}/500</Text>

        {/* Category (conditional) */}
        {needsCategory && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Kategorie</Text>
            <Pressable
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.pickerButtonText, { color: category ? colors.textPrimary : colors.textTertiary }]}>
                {selectedLabel}
              </Text>
            </Pressable>
            {showCategoryPicker && (
              <View style={[styles.pickerList, { backgroundColor: colors.surface }]}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.value}
                    onPress={() => { setCategory(cat.value); setShowCategoryPicker(false); }}
                    style={[
                      styles.pickerItem,
                      { borderBottomColor: colors.border },
                      category === cat.value ? { backgroundColor: colors.primaryLight } : undefined,
                    ]}
                  >
                    <Text style={[styles.pickerItemText, { color: colors.textPrimary }]}>{cat.label}</Text>
                    {category === cat.value && (
                      <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <WizardFooter
        step={2}
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={!canProceed}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 4,
  },
  inputMultiline: {
    minHeight: 120,
  },
  counter: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'right',
    marginBottom: 20,
  },
  pickerButton: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  pickerButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  pickerList: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  checkmark: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
