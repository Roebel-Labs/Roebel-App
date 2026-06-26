import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Modal,
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
// linear-gradient(180deg, #FDC705 15.34%, #E3E5E9 37.26%, #8EB9FF 80.57%), #FFF
const GRADIENT_COLORS = ['#FDC705', '#E3E5E9', '#8EB9FF'] as const;
const GRADIENT_LOCATIONS = [0.1534, 0.3726, 0.8057] as const;

const NAVY = '#0A2540';
const SUBTITLE = '#23405E';

const DEFAULT_SUBTITLE =
  'Du hast Röbel Münzen erhalten, nun finde heraus wofür du sie benutzen kannst.';

interface MuenzenRewardOverlayProps {
  visible: boolean;
  /** How many Röbel Münzen the user just received (already rounded). */
  amount: number;
  /** Optional copy override; defaults to the standard reward line. */
  subtitle?: string;
  onClose: () => void;
}

/**
 * Full-screen celebration shown every time a citizen receives Röbel Münzen —
 * daily mint, completed tasks, checkpoint scans, votes, and so on. One coin
 * illustration for a single Münze, the trio for more, on the brand gradient.
 */
export default function MuenzenRewardOverlay({
  visible,
  amount,
  subtitle,
  onClose,
}: MuenzenRewardOverlayProps) {
  const isSingle = amount === 1;
  const coin = isSingle ? SINGLE : MANY;
  const label = isSingle ? 'MÜNZE' : 'MÜNZEN';

  // One orchestrated entrance: the coin springs in while the text settles.
  const coinScale = useRef(new Animated.Value(0.7)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduceMotion.current = v;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion.current) {
      coinScale.setValue(1);
      contentOpacity.setValue(1);
      return;
    }
    coinScale.setValue(0.7);
    contentOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(coinScale, {
        toValue: 1,
        friction: 6,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 320,
        delay: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, coinScale, contentOpacity]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar style="dark" />
      <View style={styles.fill}>
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
              source={coin}
              resizeMode="contain"
              style={[
                isSingle ? styles.coinSingle : styles.coinMany,
                { transform: [{ scale: coinScale }] },
              ]}
            />
            <Animated.View style={{ opacity: contentOpacity, alignItems: 'center' }}>
              <Text
                style={styles.amount}
                numberOfLines={1}
                adjustsFontSizeToFit
                allowFontScaling={false}
                accessibilityLabel={`${amount} ${isSingle ? 'Münze' : 'Münzen'} erhalten`}
              >
                {amount} {label}
              </Text>
              <Text style={styles.subtitle}>{subtitle ?? DEFAULT_SUBTITLE}</Text>
            </Animated.View>
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel="Weiter"
          >
            <Text style={styles.ctaText}>Weiter</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  safe: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coinSingle: { width: 156, height: 156, marginBottom: 56 },
  coinMany: { width: 224, height: 286, marginBottom: 44 },
  amount: {
    fontFamily: 'Inter-Bold',
    fontSize: 60,
    lineHeight: 64,
    letterSpacing: -1.5,
    color: NAVY,
    textAlign: 'center',
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
