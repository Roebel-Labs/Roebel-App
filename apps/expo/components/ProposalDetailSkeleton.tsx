/**
 * Proposal Detail Skeleton Loader
 *
 * Displays animated skeleton placeholders while proposal content is loading
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export default function ProposalDetailSkeleton() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const SkeletonBox = ({ width, height, style }: { width: string | number; height: number; style?: any }) => (
    <Animated.View style={[styles.skeleton, { width, height, opacity }, style]} />
  );

  return (
    <View style={styles.container}>
      {/* Status Badge */}
      <View style={styles.statusContainer}>
        <SkeletonBox width={120} height={28} style={{ borderRadius: 14 }} />
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <SkeletonBox width="100%" height={28} style={{ marginBottom: 8 }} />
        <SkeletonBox width="70%" height={28} />
      </View>

      {/* Metadata */}
      <View style={styles.metadataContainer}>
        <SkeletonBox width={100} height={16} />
        <SkeletonBox width={4} height={4} style={{ borderRadius: 2, marginHorizontal: 8 }} />
        <SkeletonBox width={80} height={16} />
        <SkeletonBox width={4} height={4} style={{ borderRadius: 2, marginHorizontal: 8 }} />
        <SkeletonBox width={60} height={16} />
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        <SkeletonBox width="100%" height={20} style={{ marginBottom: 12 }} />
        <SkeletonBox width="100%" height={20} style={{ marginBottom: 12 }} />
        <SkeletonBox width="100%" height={20} style={{ marginBottom: 12 }} />
        <SkeletonBox width="90%" height={20} style={{ marginBottom: 24 }} />

        <SkeletonBox width="100%" height={20} style={{ marginBottom: 12 }} />
        <SkeletonBox width="100%" height={20} style={{ marginBottom: 12 }} />
        <SkeletonBox width="85%" height={20} />
      </View>

      {/* Voting Stats */}
      <View style={styles.votingStatsCard}>
        <SkeletonBox width={100} height={20} style={{ marginBottom: 16 }} />
        <View style={styles.statRow}>
          <SkeletonBox width={60} height={16} />
          <SkeletonBox width={80} height={16} />
        </View>
        <SkeletonBox width="100%" height={8} style={{ borderRadius: 4, marginVertical: 8 }} />
        <View style={styles.statRow}>
          <SkeletonBox width={60} height={16} />
          <SkeletonBox width={80} height={16} />
        </View>
        <SkeletonBox width="100%" height={8} style={{ borderRadius: 4, marginVertical: 8 }} />
        <View style={styles.statRow}>
          <SkeletonBox width={60} height={16} />
          <SkeletonBox width={80} height={16} />
        </View>
        <SkeletonBox width="100%" height={8} style={{ borderRadius: 4 }} />
      </View>

      {/* Vote Buttons */}
      <View style={styles.voteButtonsContainer}>
        <SkeletonBox width="100%" height={56} style={{ borderRadius: 12, marginBottom: 12 }} />
        <SkeletonBox width="100%" height={56} style={{ borderRadius: 12, marginBottom: 12 }} />
        <SkeletonBox width="100%" height={56} style={{ borderRadius: 12 }} />
      </View>

      {/* Timer at bottom */}
      <View style={styles.timerBar}>
        <SkeletonBox width={140} height={16} />
        <SkeletonBox width={60} height={16} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skeleton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
  },
  statusContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleContainer: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  metadataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  contentContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  votingStatsCard: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  voteButtonsContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  timerBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginBottom: 40,
  },
});
