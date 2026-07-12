/**
 * Cards for the Mini App store, styled after the reference store flow:
 *  - <AppIcon>            squircle app icon (image or letter fallback).
 *  - <MiniAppGridTile>    icon + name, for 4-column launcher grids.
 *  - <MiniAppHeroCard>    full-width featured card (feature image or gray
 *                         placeholder) with icon/name/tagline + pill CTA.
 *  - <MiniAppCoverCard>   large cover (first screenshot or brand color),
 *                         name + tagline below — "Empfohlen" rail.
 *  - <MiniAppRowCard>     icon + name + desc + pill button, for lists.
 *
 * Buttons are installed-aware (World-App Get→Open): not installed → "Laden"
 * (goes to the preview page), installed → "Öffnen" (launches the host).
 *
 * Idioms: expo-image, useTheme colors, Mona Sans, 10px button radius.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MiniApp } from '@/lib/miniapps';
import { CATEGORY_LABELS } from '@/lib/miniapp-categories';

const BTN_RADIUS = 100; // fully-rounded pill (World-App Get/Open style)

/** German Get/Open pair (App-Store convention). */
export function installLabel(installed: boolean): string {
  return installed ? 'Öffnen' : 'Laden';
}

export function AppIcon({ app, size }: { app: MiniApp; size: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        backgroundColor: app.primaryColor || colors.surfaceSecondary,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
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

/** Launcher-style tile: squircle icon with the name centered underneath. */
export function MiniAppGridTile({
  app,
  onPress,
  width,
  iconSize = 64,
}: {
  app: MiniApp;
  onPress: () => void;
  width: number;
  iconSize?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && { opacity: 0.7 }]}
    >
      <AppIcon app={app} size={iconSize} />
      <Text style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={1}>
        {app.name}
      </Text>
    </Pressable>
  );
}

const HERO_RATIO = 0.7;
const HERO_RADIUS = 24;

/**
 * Full-width featured card for the store hero carousel: feature image (or a
 * gray placeholder block) with a scrim-backed bottom row — icon, name,
 * one-line tagline, pill CTA.
 */
export function MiniAppHeroCard({
  app,
  width,
  installed,
  onPress,
}: {
  app: MiniApp;
  width: number;
  installed: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.hero,
        { width, height: Math.round(width * HERO_RATIO) },
        pressed && { opacity: 0.9 },
      ]}
    >
      {app.featureImageUrl ? (
        <Image
          source={{ uri: app.featureImageUrl }}
          style={[styles.heroImg, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
        />
      ) : (
        // Placeholder until the app has feature artwork: plain gray block.
        <View style={[styles.heroImg, { backgroundColor: colors.surfaceSecondary }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        style={styles.heroScrim}
        pointerEvents="none"
      />
      <View style={styles.heroRow}>
        <AppIcon app={app} size={44} />
        <View style={styles.heroBody}>
          <Text style={styles.heroName} numberOfLines={1}>
            {app.name}
          </Text>
          <Text style={styles.heroDesc} numberOfLines={1}>
            {app.description ?? CATEGORY_LABELS[app.category]}
          </Text>
        </View>
        <View style={styles.heroBtn}>
          <Text style={styles.heroBtnText}>{installLabel(installed)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const COVER_W = 280;

/** Big editorial card: cover image (first screenshot) or brand-color block. */
export function MiniAppCoverCard({ app, onPress }: { app: MiniApp; onPress: () => void }) {
  const { colors } = useTheme();
  const cover = app.screenshots[0] ?? null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cover, pressed && { opacity: 0.85 }]}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={[styles.coverImg, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.coverImg, styles.coverFallback, { backgroundColor: app.primaryColor || colors.primary }]}>
          <AppIcon app={app} size={64} />
        </View>
      )}
      <Text style={[styles.coverName, { color: colors.textPrimary }]} numberOfLines={1}>
        {app.name}
      </Text>
      <Text style={[styles.coverDesc, { color: colors.textSecondary }]} numberOfLines={1}>
        {app.description ?? CATEGORY_LABELS[app.category]}
      </Text>
    </Pressable>
  );
}

export function MiniAppRowCard({
  app,
  installed = false,
  onPress,
  columnMode = false,
}: {
  app: MiniApp;
  installed?: boolean;
  onPress: () => void;
  /** Inside a fixed-width carousel column: drop the row's own side padding. */
  columnMode?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        columnMode && styles.rowColumn,
        pressed && { opacity: 0.7 },
      ]}
    >
      <AppIcon app={app} size={56} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
          {app.name}
        </Text>
        <Text style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={1}>
          {app.description ?? CATEGORY_LABELS[app.category]}
        </Text>
      </View>
      <View style={[styles.openBtn, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.openBtnText, { color: colors.textPrimary }]}>
          {installLabel(installed)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
  },
  tileName: {
    marginTop: 8,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: '100%',
  },
  hero: {
    borderRadius: HERO_RADIUS,
    overflow: 'hidden',
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
  },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
  heroRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  heroBody: { flex: 1 },
  heroName: {
    color: '#fff',
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  heroDesc: {
    marginTop: 1,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  heroBtn: {
    backgroundColor: '#111114',
    paddingHorizontal: 20,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnText: {
    color: '#fff',
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  cover: {
    width: COVER_W,
  },
  coverImg: {
    width: COVER_W,
    height: COVER_W * 0.62,
    borderRadius: 16,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverName: {
    marginTop: 10,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
  },
  coverDesc: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowColumn: {
    paddingHorizontal: 0,
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
    paddingHorizontal: 16,
    height: 34,
    borderRadius: BTN_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
});
