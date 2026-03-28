import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export default function ProposalSkeleton() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
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
    );
    animation.start();

    return () => animation.stop();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={styles.card}>
      {/* Status badge */}
      <Animated.View style={[styles.badgeSkeleton, { opacity }]} />

      {/* Title - 2 lines */}
      <Animated.View style={[styles.titleLine1, { opacity }]} />
      <Animated.View style={[styles.titleLine2, { opacity }]} />

      {/* Metadata row (proposer + date) */}
      <Animated.View style={[styles.metadataSkeleton, { opacity }]} />

      {/* Vote progress bar */}
      <Animated.View style={[styles.progressBarSkeleton, { opacity }]} />

      {/* Vote percentages */}
      <View style={styles.percentageRow}>
        <Animated.View style={[styles.percentageSkeleton, { opacity }]} />
        <Animated.View style={[styles.percentageSkeleton, { opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeSkeleton: {
    width: 100,
    height: 24,
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 12,
  },
  titleLine1: {
    width: '100%',
    height: 20,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 8,
  },
  titleLine2: {
    width: '75%',
    height: 20,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 16,
  },
  metadataSkeleton: {
    width: 200,
    height: 14,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 16,
  },
  progressBarSkeleton: {
    width: '100%',
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 12,
  },
  percentageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  percentageSkeleton: {
    width: 80,
    height: 14,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
  },
});
