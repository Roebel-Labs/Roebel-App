import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { ChipTone } from '@/lib/vorhaben-labels';

/** Small status pill (same shape as OrgRoleBadge), colored from theme tokens. */
export default function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  const { colors } = useTheme();
  const palette: Record<ChipTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceSecondary, fg: colors.textSecondary },
    info: { bg: colors.infoBackground, fg: colors.info },
    warning: { bg: colors.warningBackground, fg: colors.warning },
    success: { bg: colors.successBackground, fg: colors.success },
    error: { bg: colors.errorBackground, fg: colors.error },
  };
  const c = palette[tone];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontFamily: fontFamily.medium },
});
