import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { RegisterCard } from '@/lib/credreg/model';

type Props = {
  badges: RegisterCard[];
  onPress: (card: RegisterCard) => void;
  /** Horizontal padding the grid applies itself (the profile sheet has none, so 16). */
  inset?: number;
  /** Horizontal padding the parent already applies on each side. */
  parentInset?: number;
};

const COLUMNS = 3;
const GAP = 12;

/** "Abzeichen": three columns of square tiles, title under each. Nothing for an empty list. */
export default function BadgeGrid({ badges, onPress, inset = 16, parentInset = 0 }: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  if (badges.length === 0) return null;
  const tile = Math.floor((screenWidth - (inset + parentInset) * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <View style={[styles.section, { paddingHorizontal: inset }]}>
      <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header">
        Abzeichen
      </Text>
      <View style={styles.grid}>
        {badges.map((badge) => (
          <Pressable
            key={badge.key}
            onPress={() => onPress(badge)}
            accessibilityRole="button"
            accessibilityLabel={badge.state === 'expired' ? `${badge.title}, Abgelaufen` : badge.title}
            style={[styles.cell, { width: tile }]}
          >
            <View
              style={[
                styles.tile,
                { width: tile, height: tile, backgroundColor: colors.surfaceSecondary },
                badge.state === 'expired' && styles.dimmed,
              ]}
            >
              {badge.imageUrl ? (
                <Image source={{ uri: badge.imageUrl }} style={{ width: tile, height: tile }} resizeMode="cover" />
              ) : (
                <RibbonMark size={Math.round(tile * 0.42)} color={colors.primary} />
              )}
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {badge.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** The neutral default badge: a medal disc with two ribbon tails, drawn with views. */
function RibbonMark({ size, color }: { size: number; color: string }) {
  const tailW = Math.round(size * 0.28);
  const tailH = Math.round(size * 0.5);
  return (
    <View style={{ width: size, height: size + tailH * 0.6, alignItems: 'center' }}>
      <View style={[styles.tails, { top: size * 0.6 }]}>
        <View style={{ width: tailW, height: tailH, backgroundColor: color, opacity: 0.7, transform: [{ rotate: '18deg' }] }} />
        <View style={{ width: tailW, height: tailH, backgroundColor: color, opacity: 0.7, transform: [{ rotate: '-18deg' }] }} />
      </View>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  heading: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GAP,
    rowGap: 16,
  },
  cell: {
    gap: 6,
  },
  tile: {
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.45,
  },
  title: {
    fontSize: 13,
    fontFamily: 'MonaSans-Medium',
    textAlign: 'center',
  },
  tails: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 2,
  },
});
