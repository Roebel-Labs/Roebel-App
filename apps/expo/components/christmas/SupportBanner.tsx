import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useBannerSurface } from '@/components/profile/bannerSurface';
import { BADGES_BANNER_HEIGHT } from '@/components/profile/BadgesBanner';

const ILLUSTRATION = require('@/assets/illustration/christmas/support_gifts.webp');

type Props = {
  /** Horizontal margin; 0 inside a carousel page that pads itself. */
  inset?: number;
  /** Top margin; the profile banners use 16, feed/Erkunden slots set their own. */
  marginTop?: number;
};

/**
 * "Weihnachten · Unterstütze die Röbel App" — same shape as the Abzeichen banner: text left, the gift
 * illustration right, cut off by the card's bottom edge. Opens /unterstuetzen.
 */
export default function SupportBanner({ inset = 16, marginTop = 16 }: Props) {
  const { colors } = useTheme();
  const surface = useBannerSurface();
  const router = useRouter();
  const year = new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  return (
    <PressableScale
      onPress={() => router.push('/unterstuetzen' as any)}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Weihnachten ${year}: Unterstütze die Röbel App`}
      style={{ marginHorizontal: inset, marginTop }}
    >
      <View style={[styles.shadow, surface]}>
        <View style={styles.clip}>
          <View style={styles.textBlock}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Weihnachten {year}</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              Unterstütze die Röbel App
            </Text>
          </View>
          <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" accessible={false} />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: 24 },
  clip: { height: BADGES_BANNER_HEIGHT, borderRadius: 24, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  textBlock: { flex: 1, paddingLeft: 18, paddingRight: 150, gap: 4, alignItems: 'flex-start' },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  title: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 23 },
  illustration: { position: 'absolute', right: 4, top: 12, width: 150, height: 138 },
});
