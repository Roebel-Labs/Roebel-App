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
  /** Background of the logo (its dominant edge colour); null → white. */
  logoColor: string | null;
  /** Menu photos for the produced spot; without them the preview shows placeholder frames. */
  dishes: DishPhoto[];
};

const LOGO_MS = 6000;
const CUSTOM_MS = 15000;
/** Share of the custom loop that belongs to the photo sequence; the end card takes the rest (~5.7 s). */
const SEQ_END = 0.62;
const PLACEHOLDERS = ['Eure Gerichte', 'Eure Produkte', 'Euer Team'];
const PLACEHOLDER_TINTS: [string, string][] = [['#3A2A1C', '#120C08'], ['#1C2A3A', '#080C12'], ['#2A1C3A', '#0C0812']];

function formatPrice(price: number | null): string | null {
  if (price == null) return null;
  return `${price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Black or white type for a #RRGGBB background (relative luminance). */
function inkFor(bg: string): string {
  const c = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.4 ? '#000000' : '#FFFFFF';
}

/**
 * A looping mock of the full-screen break ad as it airs in the DanceCup livestream: the logo
 * spot (logo large on its own background colour), or the produced spot (slow push-ins over the
 * org's own dishes, then the same logo card as the end card, logo only). Pure preview: the real spot is rendered by the
 * stream production.
 */
export default function BreakSpotPreview({ kind, orgName, logoUrl, logoColor, dishes }: Props) {
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
        <LogoCard t={t} orgName={orgName} logoUrl={logoUrl} bg={logoColor ?? '#FFFFFF'} caption={null} from={0} />
      ) : (
        <CustomSpot t={t} orgName={orgName} logoUrl={logoUrl} bg={logoColor ?? '#FFFFFF'} dishes={dishes} />
      )}
      <Text style={styles.adLabel}>Werbung</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
}

/**
 * The logo filling the screen on its own background colour, fading and scaling in; no text
 * (only the end card of the produced spot adds its offer line). `from` shifts the timeline.
 */
function LogoCard({ t, orgName, logoUrl, bg, caption, from }: {
  t: SharedValue<number>; orgName: string; logoUrl: string | null; bg: string; caption: string | null; from: number;
}) {
  const span = 1 - from;
  const at = (x: number) => from + span * x;
  const in1 = at(0.04), in2 = at(0.2), c1 = at(0.22), c2 = at(0.34), out1 = at(0.88), out2 = at(0.98);
  const ink = inkFor(bg);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: from > 0 ? interpolate(t.value, [from - 0.03, from], [0, 1], Extrapolation.CLAMP) : 1,
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [in1, in2, out1, out2], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(t.value, [in1, in2, out1], [0.9, 1, 1.05], Extrapolation.CLAMP) }],
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [c1, c2, out1, out2], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [c1, c2], [6, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, cardStyle, { backgroundColor: bg }]}>
      <View style={styles.cardCenter}>
        <Animated.View style={[caption ? styles.logoBoxSmall : styles.logoBox, logoStyle]}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImg} contentFit="contain" />
          ) : (
            <Text style={[styles.logoName, { color: ink }]} numberOfLines={2}>{orgName}</Text>
          )}
        </Animated.View>
        {caption ? <Animated.Text style={[styles.caption, { color: ink }, captionStyle]} numberOfLines={1}>{caption}</Animated.Text> : null}
      </View>
    </Animated.View>
  );
}

function CustomSpot({ t, orgName, logoUrl, bg, dishes }: { t: SharedValue<number>; orgName: string; logoUrl: string | null; bg: string; dishes: DishPhoto[] }) {
  const count = dishes.length || PLACEHOLDERS.length;
  const slot = SEQ_END / count;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Slide key={i} t={t} index={i} start={i * slot} end={(i + 1) * slot} dish={dishes[i] ?? null} placeholder={PLACEHOLDERS[i % PLACEHOLDERS.length]} />
      ))}
      <LogoCard t={t} orgName={orgName} logoUrl={logoUrl} bg={bg} caption={null} from={SEQ_END} />
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
  cardCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
  caption: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  logoBox: { width: '80%', height: '78%', alignItems: 'center', justifyContent: 'center' },
  logoBoxSmall: { width: '70%', height: '58%', alignItems: 'center', justifyContent: 'center' },
  logoImg: { width: '100%', height: '100%' },
  logoName: { fontFamily: fontFamily.heading, fontSize: 28, textAlign: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  slideCaption: { position: 'absolute', left: 14, right: 14, bottom: 16, gap: 2 },
  slideTitle: { fontFamily: fontFamily.heading, fontSize: 18, color: '#FFFFFF' },
  slidePrice: { fontFamily: fontFamily.semiBold, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  adLabel: {
    position: 'absolute', top: 8, left: 10, fontFamily: fontFamily.medium, fontSize: 9, color: '#FFFFFF', textTransform: 'uppercase',
    letterSpacing: 0.5, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(127,127,127,0.25)' },
  progressFill: { height: 3, backgroundColor: '#00498B' },
});
