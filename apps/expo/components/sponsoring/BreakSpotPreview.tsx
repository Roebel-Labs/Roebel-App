import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation, Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { fontFamily } from '@/constants/theme';
import type { DishPhoto } from '@/lib/sponsoring';

export type SpotKind = 'logo' | 'custom';

type Props = {
  kind: SpotKind;
  orgName: string;
  logoUrl: string | null;
  /** Menu photos for the produced spot; without them the preview shows placeholder frames. */
  dishes: DishPhoto[];
};

const LOGO_MS = 6000;
const CUSTOM_MS = 12000;
/** Share of the custom loop that belongs to the photo sequence; the end card takes the rest. */
const SEQ_END = 0.74;
const PLACEHOLDERS = ['Eure Gerichte', 'Eure Produkte', 'Euer Team'];
const PLACEHOLDER_TINTS: [string, string][] = [['#3A2A1C', '#120C08'], ['#1C2A3A', '#080C12'], ['#2A1C3A', '#0C0812']];

function formatPrice(price: number | null): string | null {
  if (price == null) return null;
  return `${price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * A looping mock of the full-screen break ad as it airs in the DanceCup livestream: the animated
 * "sponsored by" logo card, or the produced spot (slow push-ins over the org's own dishes, then an
 * end card). Pure preview: the real spot is rendered by the stream production.
 */
export default function BreakSpotPreview({ kind, orgName, logoUrl, dishes }: Props) {
  const t = useSharedValue(0);
  const duration = kind === 'logo' ? LOGO_MS : CUSTOM_MS;

  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t, duration, kind]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${t.value * 100}%` }));

  return (
    <View style={styles.frame}>
      {kind === 'logo' ? (
        <LogoCard t={t} orgName={orgName} logoUrl={logoUrl} caption="Mit freundlicher Unterstützung von" from={0} />
      ) : (
        <CustomSpot t={t} orgName={orgName} logoUrl={logoUrl} dishes={dishes} />
      )}
      <Text style={styles.bug}>DanceCup Röbel</Text>
      <Text style={styles.adLabel}>Werbung</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
}

/** Plain white card, black type, the logo itself fading and scaling in (no tile). `from` shifts the timeline (end card of the custom spot). */
function LogoCard({ t, orgName, logoUrl, caption, from }: {
  t: SharedValue<number>; orgName: string; logoUrl: string | null; caption: string | null; from: number;
}) {
  const span = 1 - from;
  const at = (x: number) => from + span * x;
  const a1 = at(0.05), a2 = at(0.15), a3 = at(0.12), a4 = at(0.27), a5 = at(0.25), a6 = at(0.37), out1 = at(0.86), out2 = at(0.96);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: from > 0 ? interpolate(t.value, [from - 0.03, from], [0, 1], Extrapolation.CLAMP) : 1,
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [a1, a2, out1, out2], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [a1, a2], [6, 0], Extrapolation.CLAMP) }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [a3, a4, out1, out2], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(t.value, [a3, a4, out1], [0.88, 1, 1.04], Extrapolation.CLAMP) }],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [a5, a6, out1, out2], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [a5, a6], [6, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, cardStyle]}>
      <View style={[StyleSheet.absoluteFill, styles.cardBg]} />
      <View style={styles.cardCenter}>
        {caption ? <Animated.Text style={[styles.caption, captionStyle]}>{caption}</Animated.Text> : null}
        <Animated.View style={[styles.logoTile, logoStyle]}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImg} contentFit="contain" />
          ) : (
            <Text style={styles.logoInitial}>{orgName.slice(0, 1)}</Text>
          )}
        </Animated.View>
        <Animated.Text style={[styles.cardName, nameStyle]} numberOfLines={1}>{orgName}</Animated.Text>
      </View>
    </Animated.View>
  );
}

function CustomSpot({ t, orgName, logoUrl, dishes }: { t: SharedValue<number>; orgName: string; logoUrl: string | null; dishes: DishPhoto[] }) {
  const count = dishes.length || PLACEHOLDERS.length;
  const slot = SEQ_END / count;
  const offer = dishes[0] ? [dishes[0].name, formatPrice(dishes[0].price)].filter(Boolean).join(' · ') : null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Slide key={i} t={t} index={i} start={i * slot} end={(i + 1) * slot} dish={dishes[i] ?? null} placeholder={PLACEHOLDERS[i % PLACEHOLDERS.length]} />
      ))}
      <LogoCard t={t} orgName={orgName} logoUrl={logoUrl} caption={offer ? `Heute: ${offer}` : null} from={SEQ_END} />
    </>
  );
}

/** One photo of the sequence: cross-fade in, slow push-in (alternating drift), caption lower left. */
function Slide({ t, index, start, end, dish, placeholder }: {
  t: SharedValue<number>; index: number; start: number; end: number; dish: DishPhoto | null; placeholder: string;
}) {
  const drift = index % 2 === 0 ? -10 : 10;
  const fade = 0.025;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [start - fade, start, end, end + fade], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));
  const kenBurns = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(t.value, [start - fade, end + fade], [1.02, 1.16], Extrapolation.CLAMP) },
      { translateX: interpolate(t.value, [start - fade, end + fade], [0, drift], Extrapolation.CLAMP) },
    ],
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [start + 0.02, start + 0.06], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [start + 0.02, start + 0.06], [8, 0], Extrapolation.CLAMP) }],
  }));
  const price = dish ? formatPrice(dish.price) : null;
  const tint = PLACEHOLDER_TINTS[index % PLACEHOLDER_TINTS.length];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, kenBurns]}>
        {dish ? (
          <Image source={{ uri: dish.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.scrim} />
      <Animated.View style={[styles.slideCaption, captionStyle]}>
        <Text style={styles.slideTitle} numberOfLines={1}>{dish ? dish.name : placeholder}</Text>
        {price ? <Text style={styles.slidePrice}>{price}</Text> : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  cardBg: { backgroundColor: '#FFFFFF' },
  cardCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  caption: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 0.6, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase' },
  logoTile: { width: '30%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  logoImg: { width: '100%', height: '100%' },
  logoInitial: { fontFamily: fontFamily.heading, fontSize: 32, color: '#00498B' },
  cardName: { fontFamily: fontFamily.heading, fontSize: 18, color: '#000000' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  slideCaption: { position: 'absolute', left: 14, right: 14, bottom: 16, gap: 2 },
  slideTitle: { fontFamily: fontFamily.heading, fontSize: 18, color: '#FFFFFF' },
  slidePrice: { fontFamily: fontFamily.semiBold, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  // Pills, so both stay readable on the white logo card and on dish photos.
  bug: {
    position: 'absolute', top: 8, right: 10, fontFamily: fontFamily.semiBold, fontSize: 9, color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  adLabel: {
    position: 'absolute', top: 8, left: 10, fontFamily: fontFamily.medium, fontSize: 9, color: '#FFFFFF', textTransform: 'uppercase',
    letterSpacing: 0.5, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(127,127,127,0.25)' },
  progressFill: { height: 3, backgroundColor: '#00498B' },
});
