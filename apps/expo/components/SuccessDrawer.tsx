/**
 * Success Drawer Component
 *
 * Reusable bottom sheet drawer for success messages
 * Replaces native Alert.alert() for success confirmations with better UX
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

interface SuccessDrawerProps {
  visible: boolean;
  title?: string;
  message: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onDismiss: () => void;
  autoDismiss?: boolean;
  autoDismissDuration?: number; // in milliseconds
}

export default function SuccessDrawer({
  visible,
  title = 'Erfolgreich!',
  message,
  primaryButtonText,
  secondaryButtonText,
  onPrimaryAction,
  onSecondaryAction,
  onDismiss,
  autoDismiss = false,
  autoDismissDuration = 3000,
}: SuccessDrawerProps) {
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

  const hasPrimaryAction = !!onPrimaryAction;
  const hasSecondaryAction = !!onSecondaryAction;

  return (
    <BottomDrawer visible={visible} onClose={onDismiss} snapPoint={0.45}>
      <View style={styles.container}>
        {/* Success Icon */}
        <View style={[styles.iconContainer, { backgroundColor: colors.successBackground }]}>
          <Text style={[styles.icon, { color: colors.success }]}>✓</Text>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

        {/* Message */}
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

        {/* Action Buttons */}
        {(hasPrimaryAction || hasSecondaryAction) && (
          <View style={styles.buttonContainer}>
            {/* Primary Button */}
            {hasPrimaryAction && (
              <Pressable
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={onPrimaryAction}
                android_ripple={{ color: '#1565C0' }}
              >
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                  {primaryButtonText || 'Weiter'}
                </Text>
              </Pressable>
            )}

            {/* Secondary Button */}
            {hasSecondaryAction && (
              <Pressable
                style={[styles.secondaryButton, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
                onPress={onSecondaryAction}
                android_ripple={{ color: colors.borderSecondary }}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                  {secondaryButtonText || 'Schließen'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Simple Dismiss Button if no actions */}
        {!hasPrimaryAction && !hasSecondaryAction && (
          <Pressable
            style={[styles.simpleButton, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
            onPress={onDismiss}
            android_ripple={{ color: colors.borderSecondary }}
          >
            <Text style={[styles.simpleButtonText, { color: colors.textPrimary }]}>OK</Text>
          </Pressable>
        )}

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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
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
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  simpleButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  simpleButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  autoDismissText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 12,
  },
});
