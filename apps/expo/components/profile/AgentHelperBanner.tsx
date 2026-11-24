import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';
import { goToTab } from '@/lib/navigation/goToTab';
import { BADGES_BANNER_HEIGHT } from '@/components/profile/BadgesBanner';

// Figma node 3128:1321: Ida, Lumi, Eiko, Olli, Mecky and Pilzi as round avatars.
const ILLUSTRATION = require('@/assets/illustration/agents/agent_cluster.webp');

/** Org Profil banner "KI Helfer — Deine Stadt-Helfer" → the Chat tab (agent chat). Same frame as BadgesBanner. */
export default function AgentHelperBanner({ inset = 16 }: { inset?: number }) {
  const { colors, isDark } = useTheme();
  const pathname = usePathname();
  return (
    <PressableScale
      onPress={() => goToTab('chat', pathname)}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel="KI Helfer: Deine Stadt-Helfer öffnen"
      style={[styles.wrap, { marginHorizontal: inset }]}
    >
      <View style={[styles.shadow, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }, softShadow(2, isDark)]}>
        <View style={styles.clip}>
          <View style={styles.textBlock}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>KI Helfer</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              Deine Stadt-Helfer
            </Text>
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
  textBlock: { flex: 1, paddingLeft: 18, paddingRight: 140, gap: 4 },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  title: { fontFamily: fontFamily.heading, fontSize: 24, lineHeight: 28 },
  illustration: { position: 'absolute', right: -6, top: -8, width: 136, height: 120 },
});
