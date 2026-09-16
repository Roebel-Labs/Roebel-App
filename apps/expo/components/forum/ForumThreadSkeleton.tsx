import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/SkeletonLoader';

/** Shimmer placeholder for the discussion screen while the thread loads. */
export default function ForumThreadSkeleton() {
  return (
    <View style={styles.wrap}>
      <Skeleton width={120} height={12} />
      <Skeleton width="92%" height={24} borderRadius={6} />
      <Skeleton width="68%" height={24} borderRadius={6} />
      <View style={styles.row}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <View style={styles.col}>
          <Skeleton width={140} height={12} />
          <Skeleton width={80} height={10} />
        </View>
      </View>
      <Skeleton width="100%" height={14} />
      <Skeleton width="96%" height={14} />
      <Skeleton width="84%" height={14} />
      <Skeleton width="58%" height={14} />
      <View style={styles.divider} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={32} height={32} borderRadius={16} />
          <View style={styles.col}>
            <Skeleton width={120} height={12} />
            <Skeleton width="100%" height={12} />
            <Skeleton width="72%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  col: { flex: 1, gap: 6 },
  divider: { height: 8 },
});
