import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import AnalyticsCard from '@/components/AnalyticsCard';

export default function GenericDashboardContent() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Übersicht</Text>
      <View style={styles.statsGrid}>
        <AnalyticsCard label="Profilaufrufe" value={0} />
        <AnalyticsCard label="Beiträge" value={0} />
        <AnalyticsCard label="Veranstaltungen" value={0} />
        <AnalyticsCard label="Reichweite" value={0} />
      </View>

      <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          Detaillierte Statistiken werden verfügbar, sobald dein Profil freigeschaltet ist.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
});
