/**
 * Mini-App reference card inside a feed post (mini_app_share posts) — icon
 * squircle + name/description + "Öffnen" pill, tap → store detail page.
 * Sibling of PostLinkedEventCard / PostLinkedMarketplaceCard.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { CATEGORY_LABELS } from '@/lib/miniapp-categories';
import type { MiniAppCategory } from '@netizen-labs/miniapp-sdk';
import type { LinkedMiniAppRef } from '@/lib/types/feed';

const ICON_SIZE = 56;

type Props = {
  miniApp: LinkedMiniAppRef;
};

export default function PostLinkedMiniAppCard({ miniApp }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    router.push(`/mini-app/${miniApp.slug}` as any);
  };

  const categoryLabel =
    CATEGORY_LABELS[(miniApp.category ?? '') as MiniAppCategory] ?? null;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.container,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: miniApp.primary_color || colors.surfaceSecondary },
        ]}
      >
        {miniApp.icon_url ? (
          <Image
            source={{ uri: miniApp.icon_url }}
            style={styles.iconImg}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.iconLetter}>{miniApp.name.slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.kicker, { color: colors.textSecondary }]} numberOfLines={1}>
          {categoryLabel ? `Mini-App · ${categoryLabel}` : 'Mini-App'}
        </Text>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {miniApp.name}
        </Text>
        {miniApp.description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>
            {miniApp.description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.openBtn, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.openBtnText, { color: colors.textPrimary }]}>Öffnen</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE * 0.24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImg: { width: '100%', height: '100%' },
  iconLetter: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  openBtn: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
