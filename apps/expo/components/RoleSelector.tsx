/**
 * Role Selector Component
 *
 * Allows dual NFT holders (Citizen + Attester) to choose which role to sign as
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface RoleSelectorProps {
  selectedRole: 'attester' | 'citizen';
  onSelectRole: (role: 'attester' | 'citizen') => void;
  disabled?: boolean;
}

export default function RoleSelector({ selectedRole, onSelectRole, disabled = false }: RoleSelectorProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Als welche Rolle unterschreiben?</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Sie besitzen sowohl Bürger- als auch Bescheiniger-NFT. Wählen Sie, als welche Rolle Sie diesen Antrag unterschreiben möchten.
      </Text>

      <View style={styles.options}>
        {/* Attester Option */}
        <Pressable
          style={[
            styles.option,
            { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
            selectedRole === 'attester' && styles.optionSelected,
            disabled && styles.optionDisabled,
          ]}
          onPress={() => !disabled && onSelectRole('attester')}
          disabled={disabled}
        >
          <View style={styles.optionHeader}>
            <View style={[styles.radio, { borderColor: colors.textTertiary }, selectedRole === 'attester' && styles.radioSelected]}>
              {selectedRole === 'attester' && <View style={styles.radioDot} />}
            </View>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }, disabled && { color: colors.textTertiary }]}>
              Als Bescheiniger
            </Text>
          </View>
          <Text style={[styles.optionDescription, { color: colors.textSecondary }, disabled && { color: colors.textTertiary }]}>
            Zählt als Bescheiniger-Unterschrift. Bescheiniger sind Mitglieder des Kulturausschusses.
          </Text>
        </Pressable>

        {/* Citizen Option */}
        <Pressable
          style={[
            styles.option,
            { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
            selectedRole === 'citizen' && styles.optionSelected,
            disabled && styles.optionDisabled,
          ]}
          onPress={() => !disabled && onSelectRole('citizen')}
          disabled={disabled}
        >
          <View style={styles.optionHeader}>
            <View style={[styles.radio, { borderColor: colors.textTertiary }, selectedRole === 'citizen' && styles.radioSelected]}>
              {selectedRole === 'citizen' && <View style={styles.radioDot} />}
            </View>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }, disabled && { color: colors.textTertiary }]}>
              Als Bürger
            </Text>
          </View>
          <Text style={[styles.optionDescription, { color: colors.textSecondary }, disabled && { color: colors.textTertiary }]}>
            Zählt als Bürger-Unterschrift. Alle verifizierten Bürger von Röbel/Müritz.
          </Text>
        </Pressable>
      </View>

      {/* Requirements Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ Anforderungen</Text>
        <Text style={styles.infoText}>
          Für eine Bürger-Verifizierung werden benötigt:{'\n'}
          • 1 Bescheiniger-Unterschrift{'\n'}
          • 2 Bürger-Unterschriften{'\n'}
          • Mindestens 3 verschiedene Personen
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
    lineHeight: 20,
  },
  options: {
    gap: 12,
  },
  option: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
  },
  optionSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#194383',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: '#194383',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#194383',
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  optionDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    marginLeft: 36,
  },
  infoBox: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#E65100',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#F57C00',
    lineHeight: 16,
  },
});
