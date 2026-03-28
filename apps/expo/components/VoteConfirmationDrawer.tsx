/**
 * Vote Confirmation Drawer
 *
 * Shows a confirmation modal with pass.png illustration
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Image } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface VoteConfirmationDrawerProps {
  visible: boolean;
  voteType: 'for' | 'against' | 'abstain' | null;
  votingPower: string;
  onConfirm: () => void;
  onCancel: () => void;
  isVoting: boolean;
}

export default function VoteConfirmationDrawer({
  visible,
  voteType,
  votingPower,
  onConfirm,
  onCancel,
  isVoting,
}: VoteConfirmationDrawerProps) {
  const { colors } = useTheme();

  const getVoteLabel = () => {
    switch (voteType) {
      case 'for':
        return 'Dafür';
      case 'against':
        return 'Dagegen';
      case 'abstain':
        return 'Enthalten';
      default:
        return '';
    }
  };

  const getVoteColor = () => {
    switch (voteType) {
      case 'for':
        return '#10b981';
      case 'against':
        return '#ef4444';
      case 'abstain':
        return colors.textSecondary;
      default:
        return colors.textPrimary;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={[styles.drawer, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
          {/* Pass Illustration */}
          <View style={styles.illustrationContainer}>
            <Image
              source={require('@/assets/illustration/pass.png')}
              style={styles.illustration}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>Stimme bestätigen</Text>

          {/* Vote Type */}
          <View style={styles.voteTypeContainer}>
            <Text style={[styles.voteTypeLabel, { color: colors.textSecondary }]}>Deine Stimme:</Text>
            <Text style={[styles.voteTypeValue, { color: getVoteColor() }]}>
              {getVoteLabel()}
            </Text>
          </View>

          {/* Voting Power */}
          <View style={[styles.infoCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Abstimmungsmacht</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{votingPower}</Text>
          </View>

          {/* Warning */}
          <Text style={styles.warning}>
            Diese Aktion kann nicht rückgängig gemacht werden.
          </Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Pressable
              style={[styles.button, styles.cancelButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.disabled }]}
              onPress={onCancel}
              disabled={isVoting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Abbrechen</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.confirmButton, { backgroundColor: colors.textPrimary }, isVoting && styles.confirmButtonDisabled]}
              onPress={onConfirm}
              disabled={isVoting}
            >
              <Text style={[styles.confirmButtonText, { color: colors.textInverted }]}>
                {isVoting ? 'Wird gesendet...' : 'Bestätigen'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  illustration: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 20,
  },
  voteTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  voteTypeLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  voteTypeValue: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  warning: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  confirmButton: {},
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
