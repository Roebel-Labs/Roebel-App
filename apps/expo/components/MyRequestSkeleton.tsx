import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Skeleton } from '@/components/SkeletonLoader';
import { useTheme } from '@/context/ThemeContext';

const SECTION_PADDING = 16;
const COL_GAP = 12;

export default function MyRequestSkeleton() {
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = screenWidth - SECTION_PADDING * 2;
  const orgCardWidth = (contentWidth - COL_GAP) / 2;

  const cardBg = isDark ? colors.surface : '#FFFFFF';

  return (
    <View style={styles.root}>
      <View style={styles.qrCardWrap}>
        <Skeleton width={270} height={320} borderRadius={24} />
      </View>

      <Skeleton width={240} height={22} style={styles.centered} />
      <Skeleton width={280} height={16} style={[styles.centered, { marginTop: 8 }]} />

      <View style={styles.buttonWrap}>
        <Skeleton width={'100%' as any} height={52} borderRadius={16} />
      </View>

      <View style={styles.shortDivider}>
        <Skeleton width={160} height={1} />
      </View>

      <View style={styles.privateWrap}>
        <View style={[styles.privateBox, { backgroundColor: '#0f1011' }]} />
      </View>

      <View style={styles.attesterHeader}>
        <Skeleton width={140} height={18} />
      </View>

      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.orgCard,
              { width: orgCardWidth, backgroundColor: cardBg, borderColor: colors.borderSecondary },
            ]}
          >
            <Skeleton width={56} height={56} borderRadius={28} />
            <Skeleton width={'70%' as any} height={14} style={{ marginTop: 12 }} />
            <Skeleton width={'55%' as any} height={12} style={{ marginTop: 6 }} />
            <Skeleton width={'80%' as any} height={12} style={{ marginTop: 14 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  qrCardWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  centered: {
    alignSelf: 'center',
  },
  buttonWrap: {
    marginTop: 20,
    paddingHorizontal: SECTION_PADDING,
  },
  shortDivider: {
    alignItems: 'center',
    marginTop: 24,
  },
  privateWrap: {
    marginTop: 16,
    paddingHorizontal: SECTION_PADDING,
  },
  privateBox: {
    height: 90,
    borderRadius: 8,
    opacity: 0.7,
  },
  attesterHeader: {
    marginTop: 24,
    paddingHorizontal: SECTION_PADDING,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COL_GAP,
    paddingHorizontal: SECTION_PADDING,
  },
  orgCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
});
