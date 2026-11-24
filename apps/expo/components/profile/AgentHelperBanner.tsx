import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { goToTab } from '@/lib/navigation/goToTab';
import { BADGES_BANNER_HEIGHT } from '@/components/profile/BadgesBanner';
import { useBannerSurface } from '@/components/profile/bannerSurface';

// Figma frame 3128:1321 (120 × 105 pt): each mascot is its own round, transparent image placed at
// its Figma position, so the banner's own surface shows through (light, dim and dark).
const MASCOTS = [
  { key: 'ida', src: require('@/assets/illustration/agents/ida.png'), x: 0, y: 40.7, size: 35 },
  { key: 'lumi', src: require('@/assets/illustration/agents/lumi.png'), x: 18.5, y: -8, size: 34.5 },
  { key: 'eiko', src: require('@/assets/illustration/agents/eiko.png'), x: 76, y: 1, size: 31.3 },
  { key: 'olli', src: require('@/assets/illustration/agents/olli.png'), x: 83.3, y: 53.2, size: 49.5 },
  { key: 'mecky', src: require('@/assets/illustration/agents/mecky.png'), x: 37.9, y: 25.7, size: 44.8 },
  { key: 'pilzi', src: require('@/assets/illustration/agents/pilzi.png'), x: 34.4, y: 75.3, size: 41.7 },
] as const;

/** Org Profil banner "KI Helfer — Deine Stadt-Helfer" → the Chat tab (agent chat). Same frame as BadgesBanner. */
export default function AgentHelperBanner({ inset = 16 }: { inset?: number }) {
  const { colors } = useTheme();
  const surface = useBannerSurface();
  const pathname = usePathname();
  return (
    <PressableScale
      onPress={() => goToTab('chat', pathname)}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel="KI Helfer: Deine Stadt-Helfer öffnen"
      style={[styles.wrap, { marginHorizontal: inset }]}
    >
      <View style={[styles.shadow, surface]}>
        <View style={styles.clip}>
          <View style={styles.textBlock}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>KI Helfer</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              Deine Stadt-Helfer
            </Text>
          </View>
          <View style={styles.cluster} pointerEvents="none">
            {MASCOTS.map((m) => (
              <Image
                key={m.key}
                source={m.src}
                style={{ position: 'absolute', left: m.x, top: m.y, width: m.size, height: m.size }}
                contentFit="contain"
                accessible={false}
              />
            ))}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  shadow: { borderRadius: 24 },
  clip: { height: BADGES_BANNER_HEIGHT, borderRadius: 24, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  textBlock: { flex: 1, paddingLeft: 18, paddingRight: 136, gap: 2 },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  title: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 23 },
  cluster: { position: 'absolute', right: 0, top: 4, width: 132, height: 112 },
});
