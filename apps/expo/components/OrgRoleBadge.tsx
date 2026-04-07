import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { OrgRole } from '@/lib/types';

type Props = {
  role: OrgRole;
  size?: 'small' | 'medium';
};

const ROLE_CONFIG: Record<OrgRole, { label: string; bgLight: string; bgDark: string; textLight: string; textDark: string }> = {
  owner: {
    label: 'Inhaber',
    bgLight: '#194383',
    bgDark: '#194383',
    textLight: '#FFFFFF',
    textDark: '#FFFFFF',
  },
  admin: {
    label: 'Admin',
    bgLight: '#DBEAFE',
    bgDark: '#1E3A5F',
    textLight: '#194383',
    textDark: '#8AB4F8',
  },
  member: {
    label: 'Mitglied',
    bgLight: '#E5E7EB',
    bgDark: '#374151',
    textLight: '#4B5563',
    textDark: '#9CA3AF',
  },
};

export default function OrgRoleBadge({ role, size = 'small' }: Props) {
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
