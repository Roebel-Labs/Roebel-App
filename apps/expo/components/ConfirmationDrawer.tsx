/**
 * Confirmation Drawer Component
 *
 * Reusable bottom sheet drawer for confirmation dialogs
 * Replaces native Alert.alert() for better UX
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

export type ConfirmationVariant = 'info' | 'warning' | 'success' | 'destructive';

interface ConfirmationDrawerProps {
  visible: boolean;
  title: string;
  message: string;
  variant?: ConfirmationVariant;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmationDrawer({
  visible,
  title,
  message,
  variant = 'info',
  icon,
  confirmText = 'Bestätigen',
  cancelText = 'Abbrechen',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationDrawerProps) {
  const { colors } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          icon: icon || '✓',
          iconColor: colors.success,
          iconBg: colors.successBackground,
          confirmBg: colors.success,
          confirmText: colors.textInverted,
        };
      case 'warning':
        return {
          icon: icon || '⚠',
          iconColor: colors.warning,
          iconBg: '#FFFBEB',
          confirmBg: colors.warning,
          confirmText: colors.textInverted,
        };
      case 'destructive':
        return {
          icon: icon || '✕',
          iconColor: colors.error,
          iconBg: colors.errorBackground,
          confirmBg: colors.error,
          confirmText: colors.textInverted,
        };
      default: // info
        return {
          icon: icon || 'ℹ',
          iconColor: colors.primary,
          iconBg: colors.primaryLight,
          confirmBg: colors.primary,
          confirmText: colors.onPrimary,
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <BottomDrawer visible={visible} onClose={onCancel} snapPoint={0.45}>
      <View style={styles.container}>
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: variantStyles.iconBg }]}>
          <Text style={[styles.icon, { color: variantStyles.iconColor }]}>
            {variantStyles.icon}
          </Text>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

        {/* Message */}
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          {/* Confirm Button */}
          <Pressable
            style={[
              styles.confirmButton,
              { backgroundColor: variantStyles.confirmBg },
              isLoading && styles.buttonDisabled,
            ]}
            onPress={onConfirm}
            disabled={isLoading}
            android_ripple={{ color: 'rgba(255, 255, 255, 0.3)' }}
          >
            <Text style={[styles.confirmButtonText, { color: variantStyles.confirmText }]}>
              {confirmText}
            </Text>
          </Pressable>

          {/* Cancel Button */}
          <Pressable
            style={[styles.cancelButton, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
            onPress={onCancel}
            disabled={isLoading}
            android_ripple={{ color: colors.borderSecondary }}
          >
            <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>{cancelText}</Text>
          </Pressable>
        </View>
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
  confirmButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
