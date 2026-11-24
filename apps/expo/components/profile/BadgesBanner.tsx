import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';

const ILLUSTRATION = require('@/assets/illustration/badges/badge_cards.webp');

export const BADGES_BANNER_HEIGHT = 112;

type Props = {
  /** Small line above the title ("Sammlung"). */
  eyebrow: string;
  title: string;
  onPress: () => void;
  /** Optional pill under the title ("Bald verfügbar"). */
  chip?: string;
  accessibilityLabel?: string;
  /** Horizontal margin; 0 inside a carousel page that pads itself. */
  inset?: number;
};

/**
 * Profile banner for Abzeichen (Figma "Deine Abzeichen"): text on the left, the three badge cards
 * on the right, cut off by the card's bottom edge.
 */
export default function BadgesBanner({ eyebrow, title, onPress, chip, accessibilityLabel, inset = 16 }: Props) {
  const { colors, isDark } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${eyebrow}: ${title}`}
      style={[styles.wrap, { marginHorizontal: inset }]}
    >
      <View style={[styles.shadow, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }, softShadow(2, isDark)]}>
        <View style={styles.clip}>
          <View style={styles.textBlock}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{eyebrow}</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {title}
            </Text>
            {chip ? (
              <View style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>{chip}</Text>
              </View>
            ) : null}
          </View>
          <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" accessible={false} />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  shadow: { borderRadius: 24 },
  clip: { height: BADGES_BANNER_HEIGHT, borderRadius: 24, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  textBlock: { flex: 1, paddingLeft: 18, paddingRight: 168, gap: 4, alignItems: 'flex-start' },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  title: { fontFamily: fontFamily.heading, fontSize: 24, lineHeight: 28 },
  chip: { marginTop: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: 11, letterSpacing: 0.2 },
  illustration: { position: 'absolute', right: 2, top: 14, width: 168, height: 128 },
});
