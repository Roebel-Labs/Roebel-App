/**
 * Verification Complete Drawer Component
 *
 * Special celebration drawer shown when user receives all required signatures
 * Auto-shows when verification is complete, guides user to delegate voting power
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

interface VerificationCompleteDrawerProps {
  visible: boolean;
  onDelegate: () => void;
  onDismiss: () => void;
}

export default function VerificationCompleteDrawer({
  visible,
  onDelegate,
  onDismiss,
}: VerificationCompleteDrawerProps) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onDismiss} snapPoint={0.5}>
      <View style={styles.container}>
        {/* Celebration Icon */}
        <View style={[styles.iconContainer, { backgroundColor: colors.successBackground }]}>
          <Text style={styles.celebrationIcon}>🎉</Text>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Glückwunsch!</Text>
        <Text style={[styles.subtitle, { color: colors.success }]}>Sie sind jetzt ein verifizierter Bürger</Text>

        {/* Message */}
        <View style={styles.messageContainer}>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Sie haben nun Ihre <Text style={[styles.boldText, { color: colors.textPrimary }]}>Bürgerschaft</Text> erhalten und können an Abstimmungen teilnehmen.
          </Text>

          <View style={[styles.infoBox, { backgroundColor: colors.successBackground, borderColor: colors.success }]}>
            <Text style={[styles.infoIcon, { color: colors.success }]}>✓</Text>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Alle Unterschriften gesammelt</Text>
              <Text style={styles.infoText}>
                Sie haben die erforderlichen Unterschriften von Bescheinigern und Bürgern erhalten.
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {/* Primary Button - Delegate */}
          <Pressable
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={onDelegate}
            android_ripple={{ color: '#1565C0' }}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Stimmrecht delegieren</Text>
          </Pressable>

          {/* Secondary Button - Dismiss */}
          <Pressable
            style={[styles.secondaryButton, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
            onPress={onDismiss}
            android_ripple={{ color: colors.borderSecondary }}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Später</Text>
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
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  celebrationIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 20,
    textAlign: 'center',
  },
  messageContainer: {
    width: '100%',
    marginBottom: 28,
  },
  message: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  boldText: {
    fontFamily: 'Inter-Medium',
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#2E7D32',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#388E3C',
    lineHeight: 18,
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
    fontFamily: 'Inter-Medium',
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
    fontFamily: 'Inter-Medium',
  },
});
