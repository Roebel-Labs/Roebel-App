/**
 * The full-screen stamp moment (spec 5.6b): on the brand background the stamp drops onto its card,
 * the haptic fires at impact (success only), then headline, lines, the Röbel Münzen line and the
 * actions. Error and info states use the same screen without the haptic. Reduced motion: nothing
 * moves, all text identical, the haptic still fires.
 */
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
  muenzen: number | null;
  actions: StampMomentAction[];
  tone: 'success' | 'info' | 'warning';
  /** Extra rows under the text (the visibility switch). */
  children?: React.ReactNode;
};

export default function StampMoment({ stamp, headline, lines, muenzen, actions, tone, children }: StampMomentProps) {
  const { colors } = useTheme();
  // A received badge with art opens like a card pack; everything else keeps the stamp drop.
  const reveal = tone === 'success' && !!stamp.imageUrl;
  const onImpact = useCallback(() => {
    if (tone === 'success' && !reveal) void stampHaptic();
  }, [tone, reveal]);
  const { cardStyle, inkStyle } = useStampAnimation({ play: !reveal, onImpact });
  const textIn = (i: number) => (reveal ? FadeInDown.delay(REVEAL_DONE_MS + i * 90).duration(380) : undefined);
  const fg = colors.onPrimary;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.primary }]} edges={['top', 'bottom']}>
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
          style={[styles.headline, { color: fg }]}
        >
          {headline}
        </Animated.Text>
        {lines.map((line, k) => (
          <Animated.Text key={`${k}:${line}`} entering={textIn(k + 1)} style={[styles.line, { color: fg }]}>
            {line}
          </Animated.Text>
        ))}
        {muenzen !== null && muenzen > 0 ? (
          <View style={[styles.muenzen, { borderColor: fg }]}>
            <Text style={[styles.muenzenText, { color: fg }]}>{`+${muenzen} Röbel Münzen`}</Text>
          </View>
        ) : null}
        {children ? <View style={styles.extra}>{children}</View> : null}
      </ScrollView>
      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                a.kind === 'primary' ? { backgroundColor: fg } : { borderColor: fg, borderWidth: 1.5 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.buttonText, { color: a.kind === 'primary' ? colors.primary : fg }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 6 },
  stampWrap: { width: '100%', maxWidth: 300, marginBottom: 20 },
  headline: { fontSize: 28, fontFamily: fontFamily.heading, textAlign: 'center' },
  line: { fontSize: 16, fontFamily: fontFamily.regular, textAlign: 'center', opacity: 0.92 },
  muenzen: { marginTop: 10, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  muenzenText: { fontSize: 15, fontFamily: fontFamily.semiBold },
  extra: { width: '100%', marginTop: 18 },
  actions: { paddingHorizontal: 24, paddingBottom: 16, gap: 10 },
  button: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  pressed: { opacity: 0.85 },
});
