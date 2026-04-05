import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onDelete: () => void;
  onSaveAndExit: () => void;
  onCancel: () => void;
};

export default function ExitWizardSheet({ visible, onDelete, onSaveAndExit, onCancel }: Props) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Wirklich abbrechen?</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Du kannst deinen Fortschritt speichern und später fortfahren, oder alles löschen und von vorne beginnen.
          </Text>

          <Pressable onPress={onSaveAndExit} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Speichern und Abbrechen</Text>
          </Pressable>

          <Pressable onPress={onDelete} style={[styles.deleteButton, { borderColor: colors.border }]}>
            <Text style={[styles.deleteButtonText, { color: colors.error }]}>Löschen</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  body: {
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
    fontFamily: 'Inter-Medium',
  },
  deleteButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
