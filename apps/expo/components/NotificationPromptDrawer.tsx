import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NotificationPromptDrawerProps {
  visible: boolean;
  onActivate: () => void;
  onDismiss: () => void;
}

export default function NotificationPromptDrawer({
  visible,
  onActivate,
  onDismiss,
}: NotificationPromptDrawerProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <View style={[styles.drawer, { backgroundColor: colors.background }]}>
          <View style={[styles.handle, { backgroundColor: colors.borderSecondary }]} />

          <Text style={[styles.title, { color: colors.textPrimary }]}>Pushnachrichten</Text>

          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Benachrichtigungen helfen Ihnen, keine wichtigen Veranstaltungen und
            Nachrichten aus Röbel zu verpassen. Sie können die Einstellungen
            jederzeit ändern.
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={[styles.dismissButton, { borderColor: colors.borderSecondary }]}
              onPress={onDismiss}
            >
              <Text style={[styles.dismissButtonText, { color: colors.textSecondary }]}>Nein, Danke</Text>
            </Pressable>

            <Pressable
              style={[styles.activateButton, { backgroundColor: colors.primary }]}
              onPress={onActivate}
            >
              <Text style={[styles.activateButtonText, { color: colors.onPrimary }]}>Aktivieren</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    minHeight: SCREEN_HEIGHT * 0.3,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  activateButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
