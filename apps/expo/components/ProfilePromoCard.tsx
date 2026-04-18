import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

type Variant = 'entdecken' | 'card';

type Props = {
  variant: Variant;
  onPress?: () => void;
};

const VARIANTS: Record<Variant, { title: string; subtitle: string; emoji: string; href: string }> = {
  entdecken: {
    title: 'Entdecken',
    subtitle: 'Veranstaltungen, Orte und Neuigkeiten aus Röbel.',
    emoji: '🧭',
    href: '/explore',
  },
  card: {
    title: 'Röbel Card',
    subtitle: 'Deine Vorteilskarte für lokale Partner.',
    emoji: '💳',
    href: '/roebel-card',
  },
};

export default function ProfilePromoCard({ variant, onPress }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { title, subtitle, emoji, href } = VARIANTS[variant];

  const isCardVariant = variant === 'card';

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push(href as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
        {isCardVariant ? (
          <Image
            source={require('../assets/images/card.png')}
            style={styles.cardImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.emoji}>{emoji}</Text>
        )}
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  emoji: {
    fontSize: 26,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  chevron: {
    fontSize: 24,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: 4,
  },
});
