/**
 * Skeleton body for detail pages in CollapsingHeroScreen: mirrors the real
 * layout (title lines, meta, paragraphs, image block, rows). Must render
 * inside a SkeletonScope (CollapsingHeroScreen provides it when `loading`),
 * so one shimmer band passes over hero and body together.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Bone } from '@/components/skeleton/Skeleton';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  /** Centered title/meta (marketplace service, org page). */
  centered?: boolean;
  /** Circular avatar sitting on the sheet's top edge (diameter). */
  avatar?: number;
  /** Show a wide image block between the paragraphs. */
  imageBlock?: boolean;
  /** Number of list rows at the end. */
  rows?: number;
};

export default function DetailBodySkeleton({ centered = false, avatar, imageBlock = true, rows = 3 }: Props) {
  const { colors } = useTheme();
  const align = centered ? 'center' : 'flex-start';
  return (
    <View style={styles.wrap}>
      {avatar ? (
        <View style={[styles.avatarRing, { width: avatar + 8, height: avatar + 8, borderRadius: (avatar + 8) / 2, marginTop: -(avatar + 8) / 2, backgroundColor: colors.background }]}>
          <Bone width={avatar} height={avatar} radius={avatar / 2} />
        </View>
      ) : null}
      <View style={[styles.block, { alignItems: align, paddingTop: avatar ? 16 : 24 }]}>
        <Bone width="78%" height={28} radius={8} />
        <Bone width="52%" height={28} radius={8} style={styles.gap8} />
        <Bone width={centered ? '70%' : '44%'} height={14} radius={6} style={styles.gap16} />
        <Bone width={centered ? '50%' : '32%'} height={14} radius={6} style={styles.gap8} />
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.block}>
        <Bone width="100%" height={14} radius={6} />
        <Bone width="96%" height={14} radius={6} style={styles.gap10} />
        <Bone width="88%" height={14} radius={6} style={styles.gap10} />
        <Bone width="62%" height={14} radius={6} style={styles.gap10} />
      </View>
      {imageBlock ? (
        <View style={styles.block}>
          <Bone width="100%" height={180} radius={20} style={styles.gap24} />
        </View>
      ) : null}
      <View style={[styles.block, styles.gap24]}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} style={styles.row}>
            <Bone width={40} height={40} radius={20} />
            <View style={styles.rowText}>
              <Bone width="58%" height={14} radius={6} />
              <Bone width="38%" height={12} radius={6} style={styles.gap8} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 48 },
  avatarRing: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  block: { paddingHorizontal: 24 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 24, marginVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  rowText: { flex: 1 },
  gap8: { marginTop: 8 },
  gap10: { marginTop: 10 },
  gap16: { marginTop: 16 },
  gap24: { marginTop: 24 },
});
