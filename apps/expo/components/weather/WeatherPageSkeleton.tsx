import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/SkeletonLoader';
import { useTheme } from '@/context/ThemeContext';

export default function WeatherPageSkeleton() {
  const { colors } = useTheme();

  return (
    <View>
      <View style={[styles.hero, { backgroundColor: colors.skeleton }]}>
        <Skeleton width={80} height={12} borderRadius={4} />
        <View style={styles.tempRow}>
          <Skeleton width={160} height={56} borderRadius={8} />
          <Skeleton width={40} height={40} borderRadius={8} />
        </View>
        <Skeleton width={140} height={14} borderRadius={4} style={styles.spacerSm} />
        <Skeleton width={200} height={15} borderRadius={4} style={styles.spacerLg} />
        <Skeleton width={200} height={14} borderRadius={4} style={styles.spacerSm} />
        <Skeleton width={200} height={14} borderRadius={4} style={styles.spacerSm} />
        <View style={[styles.statsBox, { borderColor: colors.borderSecondary }]}>
          {[0, 1, 2, 3, 4].map((index) => (
            <View
              key={index}
              style={[
                styles.statRow,
                index < 4 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.borderSecondary,
                },
              ]}
            >
              <Skeleton width={140} height={12} borderRadius={4} />
              <Skeleton width={70} height={12} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Skeleton width={200} height={18} borderRadius={4} style={styles.sectionTitle} />
        <View style={styles.hourlyRow}>
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={styles.hourlyColumn}>
              <Skeleton width={36} height={13} borderRadius={4} />
              <Skeleton width={44} height={16} borderRadius={4} />
              <Skeleton width={36} height={36} borderRadius={8} />
              <Skeleton width={48} height={12} borderRadius={4} />
              <Skeleton width={56} height={12} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Skeleton width={180} height={18} borderRadius={4} style={styles.sectionTitle} />
        <View style={styles.weeklyList}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <View
              key={index}
              style={[
                styles.weeklyCard,
                { backgroundColor: colors.background, borderColor: colors.borderSecondary },
              ]}
            >
              <Skeleton width={80} height={14} borderRadius={4} />
              <View style={styles.weeklyTempRow}>
                <Skeleton width={80} height={40} borderRadius={8} />
                <Skeleton width={56} height={56} borderRadius={12} />
              </View>
              <Skeleton width={120} height={14} borderRadius={4} style={styles.weeklyRange} />
              <Skeleton width={160} height={14} borderRadius={4} style={styles.weeklyCondition} />
              <View style={[styles.weeklyMetrics, { borderTopColor: colors.borderSecondary }]}>
                <View style={styles.weeklyMetric}>
                  <Skeleton width={40} height={12} borderRadius={4} />
                  <Skeleton width={100} height={13} borderRadius={4} />
                </View>
                <View style={styles.weeklyMetric}>
                  <Skeleton width={80} height={12} borderRadius={4} />
                  <Skeleton width={120} height={13} borderRadius={4} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 24,
    padding: 16,
    minHeight: 320,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  spacerSm: {
    marginTop: 8,
  },
  spacerLg: {
    marginTop: 16,
  },
  statsBox: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  statRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  hourlyRow: {
    flexDirection: 'row',
    gap: 16,
  },
  hourlyColumn: {
    width: 76,
    alignItems: 'center',
    gap: 8,
  },
  weeklyList: {
    gap: 12,
  },
  weeklyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  weeklyTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weeklyRange: {
    marginTop: 2,
  },
  weeklyCondition: {
    marginTop: 8,
  },
  weeklyMetrics: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 24,
  },
  weeklyMetric: {
    flex: 1,
    gap: 4,
  },
});
