import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';

const BUERGERUMFRAGEN_ILLUSTRATION = require('../../assets/illustration/buergerumfragen.png');

export default function BuergerWerdenBanner() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const onPress = () => router.push('/verification/request-citizen' as any);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface },
        softShadow(2, isDark),
      ]}
    >
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Bürger werden</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Beantragen Sie Ihren Bürger-Pass
        </Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Jetzt beantragen"
        >
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Jetzt beantragen</Text>
        </Pressable>
      </View>

      <Image
        source={BUERGERUMFRAGEN_ILLUSTRATION}
        style={styles.illustration}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 16,
    minHeight: 132,
  },
  textBlock: {
    flex: 1,
    gap: 8,
    paddingVertical: 4,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    lineHeight: 24,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  cta: {
    alignSelf: 'flex-start',
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
  illustration: {
    width: 120,
    height: 120,
  },
});
