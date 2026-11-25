/**
 * The full-screen moment after a scan (spec 5.6b, Figma "Abzeichen erhalten"): a soft light-blue
 * gradient, the badge card (opening like a pack when it has art, otherwise the stamp drop), the
 * headline and lines in dark text, and the actions at the bottom. Text and buttons fade in once
 * the card has turned. Error and info states use the same screen without the haptic. Reduced
 * motion: nothing moves, all text identical, the haptic still fires. Never shows Röbel Münzen.
 */
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { stampHaptic, useStampAnimation } from '@/lib/credreg/motion';
import StampCard, { type StampCardProps } from './StampCard';
import CardReveal, { REVEAL_DONE_MS } from './CardReveal';

export type StampMomentAction = { label: string; onPress(): void; kind: 'primary' | 'secondary' };

export type StampMomentProps = {
  stamp: StampCardProps;
  headline: string;
  lines: string[];
  /** Kept for callers; never rendered (event attendance pays no Röbel Münzen). */
  muenzen?: number | null;
  actions: StampMomentAction[];
  tone: 'success' | 'info' | 'warning';
  /** Extra rows under the text. */
  children?: React.ReactNode;
};

/** The moment's background: light blue at the top into the page grey (dark mode: deep navy). */
export function useMomentGradient(): [string, string, string] {
  const { colors, isDark } = useTheme();
  return isDark ? ['#12304F', '#0D1B2C', colors.background] : ['#BFDBF4', '#DCE9F6', '#F4F5F8'];
}

/** After the stamp drop (no art) the text follows sooner than after the pack reveal. */
const STAMP_TEXT_DELAY_MS = 450;

export default function StampMoment({ stamp, headline, lines, actions, tone, children }: StampMomentProps) {
  const { colors } = useTheme();
  const gradient = useMomentGradient();
  // A received badge with art opens like a card pack; everything else keeps the stamp drop.
  const reveal = tone === 'success' && !!stamp.imageUrl;
  const onImpact = useCallback(() => {
    if (tone === 'success' && !reveal) void stampHaptic();
  }, [tone, reveal]);
  const { cardStyle, inkStyle } = useStampAnimation({ play: !reveal, onImpact });
  const base = reveal ? REVEAL_DONE_MS : STAMP_TEXT_DELAY_MS;
  const textIn = (i: number) => FadeInDown.delay(base + i * 110).duration(420);
  const buttonsIn = FadeIn.delay(base + (lines.length + 1) * 110 + 150).duration(380);

  return (
    <LinearGradient colors={gradient} style={styles.root}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          {reveal && stamp.imageUrl ? (
            <CardReveal imageUrl={stamp.imageUrl} />
          ) : (
            <View style={styles.stampWrap}>
              <StampCard {...stamp} stampStyle={cardStyle} inkStyle={inkStyle} Layer={Animated.View as never} />
            </View>
          )}
          <Animated.Text
            entering={textIn(0)}
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={[styles.headline, { color: colors.textPrimary }]}
          >
            {headline}
          </Animated.Text>
          {lines.map((line, k) => (
            <Animated.Text key={`${k}:${line}`} entering={textIn(k + 1)} style={[styles.line, { color: colors.textPrimary }]}>
              {line}
            </Animated.Text>
          ))}
          {children ? <View style={styles.extra}>{children}</View> : null}
        </ScrollView>
        {actions.length > 0 ? (
          <Animated.View entering={buttonsIn} style={styles.actions}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  a.kind === 'primary' ? { backgroundColor: colors.primary } : { borderColor: colors.border, borderWidth: 1.5 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.buttonText, { color: a.kind === 'primary' ? colors.onPrimary : colors.textPrimary }]}>{a.label}</Text>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 8 },
  stampWrap: { width: '100%', maxWidth: 300, marginBottom: 20 },
  headline: { fontSize: 34, lineHeight: 40, fontFamily: fontFamily.heading, textAlign: 'center', marginTop: 8 },
  line: { fontSize: 17, lineHeight: 24, fontFamily: fontFamily.medium, textAlign: 'center' },
  extra: { width: '100%', marginTop: 18 },
  actions: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  button: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontFamily: fontFamily.semiBold },
  pressed: { opacity: 0.85 },
});
