import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export default function FeedPostSkeleton() {
  const { colors } = useTheme();
  const bg = colors.skeleton;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <View style={[styles.avatar, { backgroundColor: bg }]} />
        <View style={styles.authorInfo}>
          <View style={[styles.nameLine, { backgroundColor: bg }]} />
          <View style={[styles.metaLine, { backgroundColor: bg }]} />
        </View>
      </View>

      {/* Content lines */}
      <View style={[styles.textLine, { backgroundColor: bg, width: '100%' }]} />
      <View style={[styles.textLine, { backgroundColor: bg, width: '80%' }]} />

      {/* Image placeholder */}
      <View style={[styles.imagePlaceholder, { backgroundColor: bg }]} />

      {/* Action row */}
      <View style={styles.actionRow}>
        <View style={[styles.actionItem, { backgroundColor: bg }]} />
        <View style={[styles.actionItem, { backgroundColor: bg }]} />
        <View style={[styles.actionItem, { backgroundColor: bg }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    opacity: 0.7,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  authorInfo: {
    gap: 6,
  },
  nameLine: {
    height: 12,
    width: 120,
    borderRadius: 4,
  },
  metaLine: {
    height: 10,
    width: 80,
    borderRadius: 4,
  },
  textLine: {
    height: 12,
    borderRadius: 4,
  },
  imagePlaceholder: {
    height: 180,
    borderRadius: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 6,
  },
  actionItem: {
    height: 16,
    width: 50,
    borderRadius: 4,
  },
});
