import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily, fontSize, borderRadius } from '@/constants/theme';

export default function FortuneCardsBanner() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => router.push('/games/fortune-cards' as any)}
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
      >
        <LinearGradient
          colors={['#4A148C', '#1A237E', '#0D47A1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          {/* Decorative stars */}
          <Text style={styles.star1}>✦</Text>
          <Text style={styles.star2}>✧</Text>
          <Text style={styles.star3}>✦</Text>

          {/* Mecky */}
          <Image
            source={require('@/assets/games/mecky/mecky_main.png')}
            style={styles.meckyImage}
            resizeMode="contain"
          />

          {/* Text content */}
          <View style={styles.textContent}>
            <Text style={styles.title}>Tagesglückskarte</Text>
            <Text style={styles.subtitle}>Ziehe deine Karte des Tages! ✨</Text>
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
  meckyImage: {
    width: 56,
    height: 56,
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
    color: 'rgba(255,255,255,0.8)',
  },
  arrow: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 8,
    fontFamily: fontFamily.regular,
  },
  // Decorative stars
  star1: {
    position: 'absolute',
    top: 8,
    right: 50,
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
  },
  star2: {
    position: 'absolute',
    top: 16,
    right: 80,
    fontSize: 14,
    color: 'rgba(255,255,255,0.15)',
  },
  star3: {
    position: 'absolute',
    bottom: 10,
    right: 60,
    fontSize: 8,
    color: 'rgba(255,255,255,0.2)',
  },
});
