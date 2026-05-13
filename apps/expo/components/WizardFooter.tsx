import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextContent?: React.ReactNode;
};

export default function WizardFooter({
  onBack,
  onNext,
  nextLabel = 'Weiter',
  nextDisabled = false,
  nextContent,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.buttonRow}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={[styles.backText, { color: colors.textSecondary }]}>Zurück</Text>
      </Pressable>
      <Pressable
        onPress={onNext}
        disabled={nextDisabled}
        style={[
          styles.nextButton,
          { backgroundColor: colors.primary },
          nextDisabled && styles.disabled,
        ]}
      >
        {nextContent || (
          <Text style={[styles.nextText, { color: colors.onPrimary }]}>{nextLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  nextButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  nextText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  disabled: {
    opacity: 0.5,
  },
});
