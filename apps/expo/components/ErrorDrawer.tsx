/**
 * Error Drawer Component
 *
 * Reusable bottom sheet drawer for error messages
 * Replaces native Alert.alert() for errors with better UX
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

interface ErrorDrawerProps {
  visible: boolean;
  title?: string;
  message: string;
  buttonText?: string;
  onDismiss: () => void;
  autoDismiss?: boolean;
  autoDismissDuration?: number; // in milliseconds
}

export default function ErrorDrawer({
  visible,
  title = 'Fehler',
  message,
  buttonText = 'OK',
  onDismiss,
  autoDismiss = false,
  autoDismissDuration = 3000,
}: ErrorDrawerProps) {
  const { colors } = useTheme();

  // Auto-dismiss effect
  React.useEffect(() => {
    if (visible && autoDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoDismissDuration);

      return () => clearTimeout(timer);
    }
  }, [visible, autoDismiss, autoDismissDuration, onDismiss]);

  return (
    <BottomDrawer visible={visible} onClose={onDismiss} snapPoint={0.4}>
      <View style={styles.container}>
        {/* Error Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✕</Text>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

        {/* Message */}
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

        {/* Dismiss Button */}
        <Pressable
          style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onDismiss}
          android_ripple={{ color: colors.border }}
        >
          <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{buttonText}</Text>
        </Pressable>

        {/* Auto-dismiss indicator */}
        {autoDismiss && (
          <Text style={[styles.autoDismissText, { color: colors.textTertiary }]}>
            Wird automatisch geschlossen...
          </Text>
        )}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 28,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  autoDismissText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 12,
  },
});
