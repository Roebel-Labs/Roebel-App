import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fontFamily, fontSize, borderRadius } from '@/constants/theme';

export default function HoroscopeBanner() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => router.push('/games/horoscope' as any)}
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
      >
        <LinearGradient
          colors={['#0f0c29', '#302b63', '#24243e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          {/* Decorative zodiac symbols */}
          <Text style={styles.deco1}>♈</Text>
          <Text style={styles.deco2}>♌</Text>
          <Text style={styles.deco3}>♏</Text>
          <Text style={styles.deco4}>✦</Text>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔮</Text>
          </View>

          {/* Text content */}
          <View style={styles.textContent}>
            <Text style={styles.title}>Tageshoroskop</Text>
            <Text style={styles.subtitle}>
              Entdecke, was die Sterne für dich bereithalten ✨
            </Text>
          </View>

          {/* Arrow */}
          <Text style={styles.arrow}>›</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  banner: {
    borderRadius: borderRadius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 26,
  },
  textContent: {
    flex: 1,
    marginLeft: 14,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.7)',
  },
  arrow: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 8,
    fontFamily: fontFamily.regular,
  },
  // Decorative symbols
  deco1: {
    position: 'absolute',
    top: 6,
    right: 55,
    fontSize: 10,
    color: 'rgba(167, 139, 250, 0.25)',
  },
  deco2: {
    position: 'absolute',
    top: 14,
    right: 85,
    fontSize: 12,
    color: 'rgba(167, 139, 250, 0.15)',
  },
  deco3: {
    position: 'absolute',
    bottom: 8,
    right: 65,
    fontSize: 9,
    color: 'rgba(167, 139, 250, 0.2)',
  },
  deco4: {
    position: 'absolute',
    bottom: 14,
    right: 95,
    fontSize: 8,
    color: 'rgba(196, 181, 253, 0.2)',
  },
});
