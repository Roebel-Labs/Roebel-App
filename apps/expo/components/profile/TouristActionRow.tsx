import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { softShadow } from '@/lib/shadow';

const COIN_STACK = require('../../assets/illustration/gamification/stack.png');
const ROEBEL_CARD = require('../../assets/illustration/profile/01.png');

export default function TouristActionRow() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { coins } = useRewards();
  const cardBg = colors.background;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push('/rewards' as any)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: cardBg, opacity: pressed ? 0.85 : 1 },
          softShadow(2, isDark),
        ]}
        accessibilityRole="button"
        accessibilityLabel="Münzen anzeigen"
      >
        <Image source={COIN_STACK} style={styles.icon} resizeMode="contain" />
        <Text style={[styles.label, { color: colors.textPrimary }]}>
          {coins.toLocaleString('de-DE')} Münzen
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/roebel-card' as any)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: cardBg, opacity: pressed ? 0.85 : 1 },
          softShadow(2, isDark),
        ]}
        accessibilityRole="button"
        accessibilityLabel="Röbel Card öffnen"
      >
        <Image source={ROEBEL_CARD} style={styles.icon} resizeMode="contain" />
        <Text style={[styles.label, { color: colors.textPrimary }]}>Röbel Card</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  icon: {
    width: 48,
    height: 48,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
