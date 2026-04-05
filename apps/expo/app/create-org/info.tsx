import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import type { BusinessCategory } from '@/lib/types';

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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 2</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">Erzähl uns mehr</Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Wie heißt deine Organisation und was macht sie aus?
        </Text>

        {/* Name */}
        <Text className="text-xs font-inter-medium text-text-secondary mb-2 uppercase tracking-wider">Name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name deiner Organisation"
          placeholderTextColor={colors.textTertiary}
          maxLength={100}
          className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-1"
        />
        <Text className="text-xs font-inter-regular text-text-tertiary text-right mb-5">{name.length}/100</Text>

        {/* Description */}
        <Text className="text-xs font-inter-medium text-text-secondary mb-2 uppercase tracking-wider">Beschreibung</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Was macht deine Organisation besonders?"
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-1 min-h-[120px]"
        />
        <Text className="text-xs font-inter-regular text-text-tertiary text-right mb-5">{description.length}/500</Text>

        {/* Category (conditional) */}
        {needsCategory && (
          <>
            <Text className="text-xs font-inter-medium text-text-secondary mb-2 uppercase tracking-wider">Kategorie</Text>
            <Pressable
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              className="bg-surface rounded-xl px-4 py-3.5 mb-2"
            >
              <Text className={`text-base font-inter-regular ${category ? 'text-text-primary' : 'text-text-tertiary'}`}>
                {selectedLabel}
              </Text>
            </Pressable>
            {showCategoryPicker && (
              <View className="bg-surface rounded-xl overflow-hidden mb-5">
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.value}
                    onPress={() => { setCategory(cat.value); setShowCategoryPicker(false); }}
                    className={`flex-row items-center justify-between px-4 py-3 border-b border-border ${category === cat.value ? 'bg-primary/10' : ''}`}
                  >
                    <Text className="text-base font-inter-regular text-text-primary">{cat.label}</Text>
                    {category === cat.value && <Text className="text-primary text-sm font-inter-medium">✓</Text>}
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3 border-t border-border">
        <Pressable onPress={() => router.back()} className="py-4 px-6">
          <Text className="text-base font-inter-medium text-text-secondary">Zurück</Text>
        </Pressable>
        <Pressable
          onPress={handleNext}
          disabled={!canProceed}
          className={`bg-primary rounded-xl py-4 px-8 ${!canProceed ? 'opacity-50' : ''}`}
        >
          <Text className="text-on-primary text-base font-inter-medium">Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
