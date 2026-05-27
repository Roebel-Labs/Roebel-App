import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';

const BUERGERUMFRAGEN_ILLUSTRATION = require('../../assets/illustration/buergerumfragen.png');

interface CitizenVerificationBannerProps {
  /**
   * When true, the banner reflects an in-progress request: copy + CTA shift to
   * "request submitted" wording, but the visual layout is otherwise the same.
   */
  pending?: boolean;
}

export default function CitizenVerificationBanner({ pending }: CitizenVerificationBannerProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const title = pending ? 'Verifizierung läuft' : 'Verifizieren Sie sich als Bürger';
  const ctaLabel = pending ? 'Status ansehen' : 'Jetzt beantragen';
  const onPress = () =>
    router.push((pending ? '/verification/my-request' : '/verification/request-citizen') as any);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.background },
        softShadow(2, isDark),
      ]}
    >
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{ctaLabel}</Text>
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
    gap: 14,
    paddingVertical: 4,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    lineHeight: 24,
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
