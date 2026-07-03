/**
 * Cards for the Mini App store. Two variants:
 *  - <MiniAppFeaturedCard>  large, for the horizontal "Empfohlen" rail.
 *  - <MiniAppRowCard>       compact icon+name+desc row, for lists / search.
 *
 * Idioms mirror FeaturedMenuItemsGrid / AttesterGrid: expo-image, useTheme
 * colors, Mona Sans, rounded surfaces. German copy.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MiniApp } from '@/lib/miniapps';
import { CATEGORY_LABELS } from '@/lib/miniapp-categories';

function AppIcon({ app, size }: { app: MiniApp; size: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: app.primaryColor || colors.surfaceSecondary,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      {app.iconUrl ? (
        <Image source={{ uri: app.iconUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <Text style={{ color: '#fff', fontFamily: fontFamily.heading, fontSize: size * 0.4 }}>
          {app.name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export function MiniAppFeaturedCard({ app, onPress }: { app: MiniApp; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.featured,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      <AppIcon app={app} size={56} />
      <Text style={[styles.featuredName, { color: colors.textPrimary }]} numberOfLines={1}>
        {app.name}
      </Text>
      <Text style={[styles.featuredDesc, { color: colors.textSecondary }]} numberOfLines={2}>
        {app.description ?? CATEGORY_LABELS[app.category]}
      </Text>
      <View style={[styles.pill, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.pillText, { color: colors.textSecondary }]}>
          {CATEGORY_LABELS[app.category]}
        </Text>
      </View>
    </Pressable>
  );
}

export function MiniAppRowCard({ app, onPress }: { app: MiniApp; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <AppIcon app={app} size={52} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
          {app.name}
        </Text>
        <Text style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {app.description ?? CATEGORY_LABELS[app.category]}
        </Text>
      </View>
      <View style={[styles.openBtn, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.openBtnText, { color: colors.textPrimary }]}>Öffnen</Text>
      </View>
    </Pressable>
  );
}

const FEATURED_W = 220;

const styles = StyleSheet.create({
  featured: {
    width: FEATURED_W,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  featuredName: {
    marginTop: 12,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  featuredDesc: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
  },
  pill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowBody: { flex: 1 },
  rowName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
  },
  rowDesc: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 17,
  },
  openBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  openBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
});
