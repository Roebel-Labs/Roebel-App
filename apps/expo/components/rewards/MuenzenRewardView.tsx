import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const SINGLE = require('../../assets/illustration/muenzen/single-reward.png');
const MANY = require('../../assets/illustration/muenzen/many-reward.png');

// Brand gradient for every "you received Röbel Münzen" moment:
// linear-gradient(180deg, #FDC705 15.34%, #E3E5E9 37.26%, #7ABBF2 80.57%), #FFF
const GRADIENT_COLORS = ['#FDC705', '#E3E5E9', '#7ABBF2'] as const;
const GRADIENT_LOCATIONS = [0.1534, 0.3726, 0.8057] as const;

const NAVY = '#0A2540';
const SUBTITLE = '#23405E';

// Pixel-block glyphs the loading label decodes out of, character by character.
const PIXEL_GLYPHS = '░▒▓█▚▞▙▟▛▜'.split('');

export const DEFAULT_REWARD_SUBTITLE =
  'Du hast Röbel Münzen erhalten, nun finde heraus wofür du sie benutzen kannst.';

interface MuenzenRewardViewProps {
  /** Münzen received. >0 renders the big "<n> MÜNZE(N)" headline. */
  amount?: number | null;
  /** Headline text shown instead of a number (errors, already-claimed, …). */
  message?: string;
  /** Supporting line under the headline. */
  subtitle?: string;
  /** While true the button shows a spinner + label and can't be pressed. */
  loading?: boolean;
  /** Label(s) next to the spinner while loading. A list advances every ~3s and
   *  then loops the reassurance tail — long loads never get stuck on one line
   *  ("Münzen werden abgeholt…" → "Einen Moment noch…" → "Fast geschafft…" → …). */
  loadingLabel?: string | string[];
  /** Button label once ready. Defaults to "Weiter". */
  buttonLabel?: string;
  /** Force a coin variant; otherwise derived from amount (defaults to the trio). */
  coin?: 'single' | 'many';
  onContinue?: () => void;
}

/**
 * Presentational Röbel Münzen reward screen on the brand gradient: a coin
 * illustration, a headline (the amount or a message), a supporting line, and a
 * bottom button that doubles as the loading indicator. The coin springs in on
 * mount; the headline + body slide up and fade in once they're ready (i.e. when
 * loading finishes). Shared by the global celebration overlay and the
 * event-attendance landing.
 */
export default function MuenzenRewardView({
  amount = null,
  message,
  subtitle,
  loading = false,
  loadingLabel = 'Wird geladen…',
  buttonLabel = 'Weiter',
  coin,
  onContinue,
}: MuenzenRewardViewProps) {
  const hasAmount = amount != null && amount > 0;
  const isSingle = coin ? coin === 'single' : hasAmount && amount === 1;
  const coinSrc = isSingle ? SINGLE : MANY;
  const label = isSingle ? 'MÜNZE' : 'MÜNZEN';
  const contentReady = !loading && (hasAmount || !!message);

  // Loading label(s): advance every ~3s; once we reach the end, loop the
  // reassurance tail (index 1+) so a long load keeps moving but never resets to
  // the opening "…werden abgeholt" line.
  const loadingLabels = (Array.isArray(loadingLabel) ? loadingLabel : [loadingLabel]).filter(
    Boolean,
  ) as string[];
  const safeLabels = loadingLabels.length ? loadingLabels : ['Wird geladen…'];
  const [labelIdx, setLabelIdx] = useState(0);
  useEffect(() => {
    if (!loading) {
      setLabelIdx(0);
      return;
    }
    if (safeLabels.length <= 1) return;
    const t = setInterval(() => {
      setLabelIdx((i) => {
        const next = i + 1;
        if (next < safeLabels.length) return next;
        return safeLabels.length > 2 ? 1 : 0;
      });
    }, 3000);
    return () => clearInterval(t);
  }, [loading, safeLabels.length]);
  const currentLabel = safeLabels[Math.min(labelIdx, safeLabels.length - 1)];

  const reduceMotion = useRef(false);
  const coinScale = useRef(new Animated.Value(0.7)).current;
  // Headline + body animate independently for a short, professional stagger.
  const headOpacity = useRef(new Animated.Value(0)).current;
  const headY = useRef(new Animated.Value(16)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const bodyY = useRef(new Animated.Value(16)).current;

  // Coin entrance on mount (the screen appears instantly).
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        reduceMotion.current = reduce;
        if (reduce) coinScale.setValue(1);
        else Animated.spring(coinScale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
      })
      .catch(() => coinScale.setValue(1));
    return () => {
      cancelled = true;
    };
  }, [coinScale]);

  // Headline + body slide in the moment the content is ready — on mount for an
  // already-resolved reward, or on the loading→done transition.
  useEffect(() => {
    if (!contentReady) {
      headOpacity.setValue(0);
      headY.setValue(16);
      bodyOpacity.setValue(0);
      bodyY.setValue(16);
      return;
    }
    if (reduceMotion.current) {
      headOpacity.setValue(1);
      headY.setValue(0);
      bodyOpacity.setValue(1);
      bodyY.setValue(0);
      return;
    }
    const ease = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(headOpacity, { toValue: 1, duration: 380, delay: 60, easing: ease, useNativeDriver: true }),
      Animated.timing(headY, { toValue: 0, duration: 440, delay: 60, easing: ease, useNativeDriver: true }),
      Animated.timing(bodyOpacity, { toValue: 1, duration: 380, delay: 170, easing: ease, useNativeDriver: true }),
      Animated.timing(bodyY, { toValue: 0, duration: 440, delay: 170, easing: ease, useNativeDriver: true }),
    ]).start();
  }, [contentReady, headOpacity, headY, bodyOpacity, bodyY]);

  return (
    <View style={styles.fill}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={GRADIENT_COLORS}
        locations={GRADIENT_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Animated.Image
            source={coinSrc}
            resizeMode="contain"
            style={[
              isSingle ? styles.coinSingle : styles.coinMany,
              { transform: [{ scale: coinScale }] },
            ]}
          />
          <View style={styles.copy}>
            {hasAmount ? (
              <Animated.Text
                style={[styles.amount, { opacity: headOpacity, transform: [{ translateY: headY }] }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                allowFontScaling={false}
                accessibilityLabel={`${amount} ${isSingle ? 'Münze' : 'Münzen'} erhalten`}
              >
                {amount} {label}
              </Animated.Text>
            ) : message ? (
              <Animated.Text
                style={[styles.message, { opacity: headOpacity, transform: [{ translateY: headY }] }]}
              >
                {message}
              </Animated.Text>
            ) : null}
            {subtitle ? (
              <Animated.Text
                style={[styles.subtitle, { opacity: bodyOpacity, transform: [{ translateY: bodyY }] }]}
              >
                {subtitle}
              </Animated.Text>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={loading ? undefined : onContinue}
          disabled={loading || !onContinue}
          style={({ pressed }) => [styles.cta, pressed && !loading && styles.ctaPressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading, busy: loading }}
          accessibilityLabel={loading ? currentLabel : buttonLabel}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={NAVY} />
              <ScrambleText text={currentLabel} style={styles.loadingLabel} reduceMotion={reduceMotion} />
            </View>
          ) : (
            <Text style={styles.ctaText}>{buttonLabel}</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  safe: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coinSingle: { width: 156, height: 156, marginBottom: 56 },
  coinMany: { width: 224, height: 286, marginBottom: 44 },
  copy: { alignItems: 'center', minHeight: 96, justifyContent: 'flex-start' },
  amount: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 60,
    lineHeight: 64,
    letterSpacing: -1.5,
    color: NAVY,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    lineHeight: 30,
    color: NAVY,
    textAlign: 'center',
    maxWidth: 320,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 24,
    color: SUBTITLE,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: 12,
  },
  cta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  ctaText: { color: NAVY, fontFamily: 'MonaSansSemiCondensed-Bold', fontSize: 17 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  // Monospace so the pixel-decode doesn't shift width as glyphs resolve.
  loadingLabel: { color: NAVY, fontFamily: 'GeistMono-Medium', fontSize: 14.5, letterSpacing: 0.3 },
});

/**
 * Loading label that "decodes" out of pixel-block glyphs whenever the text
 * changes — a short, monospace pixelate transition between loading states.
 */
function ScrambleText({
  text,
  style,
  reduceMotion,
}: {
  text: string;
  style: any;
  reduceMotion: React.MutableRefObject<boolean>;
}) {
  const [display, setDisplay] = useState(text);
  const prev = useRef(text);

  useEffect(() => {
    if (prev.current === text) return;
    prev.current = text;
    if (reduceMotion.current) {
      setDisplay(text);
      return;
    }
    const total = text.length;
    const framesToReveal = Math.max(8, Math.ceil(total * 1.1));
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      const revealed = Math.floor((frame / framesToReveal) * total);
      if (revealed >= total) {
        setDisplay(text);
        clearInterval(id);
        return;
      }
      let out = '';
      for (let i = 0; i < total; i += 1) {
        const ch = text[i];
        out += i < revealed || ch === ' ' ? ch : PIXEL_GLYPHS[Math.floor(Math.random() * PIXEL_GLYPHS.length)];
      }
      setDisplay(out);
    }, 32);
    return () => clearInterval(id);
  }, [text, reduceMotion]);

  return (
    <Text style={style} numberOfLines={1} allowFontScaling={false}>
      {display}
    </Text>
  );
}
