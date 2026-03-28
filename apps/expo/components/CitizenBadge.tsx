import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface CitizenBadgeProps {
  isCitizen: boolean;
}

export default function CitizenBadge({ isCitizen }: CitizenBadgeProps) {
  const { colors } = useTheme();

  if (isCitizen) {
    return (
      <View style={styles.badgeContainer}>
        <View style={styles.verifiedBadge}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.verifiedText}>Verified Citizen</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.badgeContainer}>
      <View style={[styles.notVerifiedBadge, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.notVerifiedText, { color: colors.textSecondary }]}>Not a Citizen</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  checkmark: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  verifiedText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  notVerifiedBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  notVerifiedText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
