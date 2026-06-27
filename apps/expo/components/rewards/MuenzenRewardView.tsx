import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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

export const DEFAULT_REWARD_SUBTITLE =
  'Du hast Röbel Münzen erhalten, nun finde heraus wofür du sie benutzen kannst.';

interface MuenzenRewardViewProps {
  /** Münzen received. >0 renders the big "<n> MÜNZE(N)" headline. */
  amount?: number | null;
  /** Headline text shown instead of a number (errors, already-claimed, …). */
  message?: string;
  /** Supporting line under the headline. */
  subtitle?: string;
  /** While true the button shows a spinner and can't be pressed. */
  loading?: boolean;
  /** Button label once ready. Defaults to "Weiter". */
  buttonLabel?: string;
  /** Force a coin variant; otherwise derived from amount (defaults to the trio). */
  coin?: 'single' | 'many';
  onContinue?: () => void;
}

/**
 * Presentational Röbel Münzen reward screen on the brand gradient: a coin
 * illustration, a headline (the amount or a message), a supporting line, and a
 * bottom button that doubles as the loading indicator. Shared by the global
 * celebration overlay and the event-attendance landing.
 */
export default function MuenzenRewardView({
  amount = null,
  message,
  subtitle,
  loading = false,
  buttonLabel = 'Weiter',
  coin,
  onContinue,
}: MuenzenRewardViewProps) {
  const hasAmount = amount != null && amount > 0;
  const isSingle = coin ? coin === 'single' : hasAmount && amount === 1;
  const coinSrc = isSingle ? SINGLE : MANY;
  const label = isSingle ? 'MÜNZE' : 'MÜNZEN';

  // One orchestrated entrance: the coin springs in while the text settles.
  const coinScale = useRef(new Animated.Value(0.7)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          coinScale.setValue(1);
          contentOpacity.setValue(1);
          return;
        }
        Animated.parallel([
          Animated.spring(coinScale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
          Animated.timing(contentOpacity, { toValue: 1, duration: 320, delay: 90, useNativeDriver: true }),
        ]).start();
      })
      .catch(() => {
        coinScale.setValue(1);
        contentOpacity.setValue(1);
      });
    return () => {
      cancelled = true;
    };
  }, [coinScale, contentOpacity]);

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
          <Animated.View style={[styles.copy, { opacity: contentOpacity }]}>
            {hasAmount ? (
              <Text
                style={styles.amount}
                numberOfLines={1}
                adjustsFontSizeToFit
                allowFontScaling={false}
                accessibilityLabel={`${amount} ${isSingle ? 'Münze' : 'Münzen'} erhalten`}
              >
                {amount} {label}
              </Text>
            ) : message ? (
              <Text style={styles.message}>{message}</Text>
            ) : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </Animated.View>
        </View>

        <Pressable
          onPress={loading ? undefined : onContinue}
          disabled={loading || !onContinue}
          style={({ pressed }) => [styles.cta, pressed && !loading && styles.ctaPressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading, busy: loading }}
          accessibilityLabel={loading ? 'Wird geladen' : buttonLabel}
        >
          {loading ? (
            <ActivityIndicator color={NAVY} />
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
  copy: { alignItems: 'center' },
  amount: {
    fontFamily: 'Inter-Bold',
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
  ctaText: { color: NAVY, fontFamily: 'Inter-SemiBold', fontSize: 17 },
});
