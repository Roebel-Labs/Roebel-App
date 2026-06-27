/**
 * Sign Request Sheet
 *
 * Bottom sheet shown when a Bürger or Bescheiniger scans someone else's
 * pending verification request. Lets the signer pick their role and
 * approve or reject.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

type Role = 'attester' | 'citizen';

interface SignRequestSheetProps {
  visible: boolean;
  onClose: () => void;
  hasCitizenNFT: boolean;
  hasAttesterNFT: boolean;
  selectedRole: Role;
  onSelectRole: (role: Role) => void;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}

const CONFIRMATIONS = [
  'Antrag wurde von einem Röbeler gestellt',
  'Identität des Antragstellers wurde überprüft',
];

export default function SignRequestSheet({
  visible,
  onClose,
  hasCitizenNFT,
  hasAttesterNFT,
  selectedRole,
  onSelectRole,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: SignRequestSheetProps) {
  const { colors, isDark } = useTheme();

  const isDualHolder = hasCitizenNFT && hasAttesterNFT;
  const busy = isApproving || isRejecting;

  const renderRoleCard = (role: Role, label: string) => {
    const selected = selectedRole === role;
    const interactive = isDualHolder && !busy;

    return (
      <Pressable
        key={role}
        onPress={() => interactive && onSelectRole(role)}
        disabled={!interactive}
        style={[
          styles.roleCard,
          {
            borderColor: selected ? colors.textPrimary : colors.borderSecondary,
            backgroundColor: selected ? colors.surface : colors.background,
          },
        ]}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        <View style={[styles.radioOuter, { borderColor: colors.textPrimary }]}>
          {selected && <View style={[styles.radioInner, { backgroundColor: colors.textPrimary }]} />}
        </View>
        <Text style={[styles.roleLabel, { color: colors.textPrimary }]}>{label}</Text>
      </Pressable>
    );
  };

  const checkBadgeBg = isDark ? colors.surface : '#1F2937';
  const checkBadgeIconColor = isDark ? colors.textPrimary : '#FFFFFF';

  return (
    <BottomDrawer visible={visible} onClose={onClose} maxSnapPoint={0.92}>
      <View style={styles.headerRow}>
        <Image
          source={require('@/assets/illustration/small/signatures.png')}
          style={styles.illustration}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={[styles.closeButton, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]}>Antrag unterzeichnen</Text>
      <Text style={[styles.subline, { color: colors.textSecondary }]}>
        Wählen Sie die Rolle aus mit der Sie unterschreiben wollen
      </Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Du bestätigst</Text>
      <View style={styles.checkList}>
        {CONFIRMATIONS.map((line) => (
          <View key={line} style={styles.checkRow}>
            <View style={[styles.checkBadge, { backgroundColor: checkBadgeBg }]}>
              <Ionicons name="checkmark" size={14} color={checkBadgeIconColor} />
            </View>
            <Text style={[styles.checkText, { color: colors.textPrimary }]}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={styles.roleStack}>
        {hasAttesterNFT && renderRoleCard('attester', 'Als Bescheiniger')}
        {hasCitizenNFT && renderRoleCard('citizen', 'Als Bürger')}
      </View>

      <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

      <View style={styles.actionStack}>
        <Pressable
          onPress={onApprove}
          disabled={busy}
          style={[styles.approveButton, busy && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Antrag genehmigen"
        >
          {isApproving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#FFFFFF" style={styles.actionIcon} />
              <Text style={styles.approveButtonText}>Antrag genehmigen</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={onReject}
          disabled={busy}
          style={[styles.rejectButton, busy && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Antrag ablehnen"
        >
          {isRejecting ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <>
              <Ionicons name="close" size={18} color="#DC2626" style={styles.actionIcon} />
              <Text style={styles.rejectButtonText}>Antrag ablehnen</Text>
            </>
          )}
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  illustration: {
    width: 56,
    height: 56,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 22,
  },
  subline: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    marginTop: 6,
    lineHeight: 21,
  },
  divider: {
    height: 1,
    marginVertical: 18,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    marginBottom: 12,
  },
  checkList: {
    marginBottom: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    flex: 1,
  },
  roleStack: {
    gap: 12,
    marginBottom: 16,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  roleLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
  },
  actionDivider: {
    height: 1,
    marginTop: 8,
    marginBottom: 16,
  },
  actionStack: {
    gap: 12,
    marginBottom: 16,
  },
  approveButton: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButtonText: {
    color: '#FFFFFF',
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 16,
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderColor: '#DC2626',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    color: '#DC2626',
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 16,
  },
  actionIcon: {
    marginRight: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
