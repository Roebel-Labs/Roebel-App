import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';

interface NamePromptSheetProps {
  visible: boolean;
  /** Close = cancel the action (no error). */
  onClose: () => void;
  /** Called with the trimmed (>= 2 chars) name once saved. */
  onSubmit: (name: string) => void;
  /** Disable the input + save button while the parent persists the value. */
  saving?: boolean;
}

/**
 * Just-in-time name prompt shown before a user can create a post when their
 * profile name is still empty. Unlike the birthdate, this name is PUBLIC — it
 * appears on every post — so the copy is honest about that.
 */
export default function NamePromptSheet({
  visible,
  onClose,
  onSubmit,
  saving = false,
}: NamePromptSheetProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const isValid = trimmed.length >= 2;

  const handleSave = () => {
    if (!isValid || saving) return;
    onSubmit(trimmed);
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Wie heißt du?
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Dein Name erscheint bei deinen Beiträgen, damit andere Bürger sehen, wer gepostet
          hat. Es werden keine weiteren Daten geteilt.
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              borderColor: colors.borderSecondary,
              color: colors.textPrimary,
            },
          ]}
          placeholder="Dein Name"
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
          editable={!saving}
          autoCapitalize="words"
          autoFocus
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        <Pressable
          onPress={handleSave}
          disabled={!isValid || saving}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: colors.primary,
              opacity: !isValid || saving ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Namen speichern"
        >
          <Text style={styles.ctaText}>{saving ? 'Wird gespeichert…' : 'Speichern'}</Text>
        </Pressable>

        <Pressable
          onPress={onClose}
          disabled={saving}
          style={styles.closeBtn}
          accessibilityRole="button"
        >
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>Abbrechen</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  headline: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
  },
  cta: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  closeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
