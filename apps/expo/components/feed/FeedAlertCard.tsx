import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { ServiceAlertRecord } from '@/lib/types/feed';
import { ALERT_TYPE_LABELS } from '@/lib/types/feed';

import LocationIcon from '@/assets/icons/location-small.svg';

type Props = {
  alert: ServiceAlertRecord;
};

export default function FeedAlertCard({ alert }: Props) {
  const { colors } = useTheme();

  const severityColors = {
    critical: { border: colors.error, bg: colors.errorBackground, text: colors.error },
    warning: { border: colors.warning, bg: colors.warningBackground, text: colors.warning },
    info: { border: colors.primary, bg: colors.primaryLight, text: colors.primary },
  };

  const scheme = severityColors[alert.severity] || severityColors.info;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: scheme.bg,
          borderLeftColor: scheme.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.severityDot, { backgroundColor: scheme.border }]} />
        <Text style={[styles.typeLabel, { color: scheme.text }]}>
          {ALERT_TYPE_LABELS[alert.alert_type]}
        </Text>
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]}>{alert.title}</Text>

      {alert.description && (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={3}>
          {alert.description}
        </Text>
      )}

      {alert.location && (
        <View style={styles.locationRow}>
          <LocationIcon width={12} height={12} color={colors.textTertiary} />
          <Text style={[styles.location, { color: colors.textTertiary }]}>{alert.location}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeLabel: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  location: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
