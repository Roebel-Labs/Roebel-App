import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';

type Props = {
  visible: boolean;
  onDelete: () => void;
  onSaveAndExit: () => void;
  onCancel: () => void;
};

export default function ExitWizardSheet({ visible, onDelete, onSaveAndExit, onCancel }: Props) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onCancel}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Wirklich abbrechen?</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Du kannst deinen Fortschritt speichern und später fortfahren, oder alles löschen und von vorne beginnen.
        </Text>

        <Pressable onPress={onSaveAndExit} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Speichern und Abbrechen</Text>
        </Pressable>

        <Pressable onPress={onDelete} style={[styles.deleteButton, { borderColor: colors.border }]}>
          <Text style={[styles.deleteButtonText, { color: colors.error }]}>Löschen</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 24,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  deleteButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
