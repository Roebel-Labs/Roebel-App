import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
};

export default function LogoutDrawer({ visible, onClose, onLogout }: Props) {
  const { colors } = useTheme();

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.3}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Wollen Sie sich abmelden?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Nachdem Sie sich abgemeldet haben, können Sie sich jeder Zeit wieder anmelden. Ihre Daten bleiben gespeichert.
        </Text>

        <View style={styles.buttonContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutButtonPressed,
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Abmelden</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              { backgroundColor: colors.surfaceSecondary },
              pressed && { backgroundColor: colors.borderSecondary },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Abbrechen</Text>
          </Pressable>
        </View>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonContainer: {
    gap: 12,
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutButtonPressed: {
    backgroundColor: '#dc2626',
  },
  logoutButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  cancelButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
