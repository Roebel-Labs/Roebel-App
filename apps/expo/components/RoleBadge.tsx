import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { UserRole } from '@/lib/types';

type Props = {
  role: UserRole;
  size?: 'small' | 'medium';
};

const ROLE_CONFIG: Record<UserRole, { label: string; bgLight: string; bgDark: string; textLight: string; textDark: string }> = {
  tourist: {
    label: 'Gast',
    bgLight: '#E5E7EB',
    bgDark: '#374151',
    textLight: '#4B5563',
    textDark: '#9CA3AF',
  },
  resident: {
    label: 'Bürger',
    bgLight: '#D1FAE5',
    bgDark: '#064E3B',
    textLight: '#065F46',
    textDark: '#6EE7B7',
  },
  business: {
    label: 'Gewerbetreibender',
    bgLight: '#DBEAFE',
    bgDark: '#1E3A5F',
    textLight: '#1E40AF',
    textDark: '#93C5FD',
  },
  official: {
    label: 'Offiziell',
    bgLight: '#FEF3C7',
    bgDark: '#78350F',
    textLight: '#92400E',
    textDark: '#FCD34D',
  },
};

export default function RoleBadge({ role, size = 'small' }: Props) {
  const { isDark } = useTheme();
  const config = ROLE_CONFIG[role];

  return (
    <View
      style={[
        styles.badge,
        size === 'medium' && styles.badgeMedium,
        { backgroundColor: isDark ? config.bgDark : config.bgLight },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          size === 'medium' && styles.badgeTextMedium,
          { color: isDark ? config.textDark : config.textLight },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeMedium: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  badgeTextMedium: {
    fontSize: 13,
  },
});
