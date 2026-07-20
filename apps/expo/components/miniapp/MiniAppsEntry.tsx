/**
 * MiniAppsEntry — the discovery entry point for the Mini App store on the
 * Explore tab, styled after the reference home surface: a 4-column launcher
 * grid of app icons (up to 7 + an "Alle ansehen" tile with mini icons) under
 * a "Mini-Apps · Mehr entdecken ›" header. Falls back to a promo banner when
 * no live apps exist.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ChevronRight } from '@/components/miniapp/hostIcons';
import { fetchLiveMiniApps, type MiniApp } from '@/lib/miniapps';
import { useInstalledMiniApps } from '@/lib/miniapp-installs';
import { MiniAppGridTile } from '@/components/miniapp/MiniAppCard';
import MiniAppHost from '@/components/miniapp/MiniAppHost';

const GRID_GAP = 12;
const MAX_TILES = 7;
const STORE_ICON = require('@/assets/illustration/mini-app-store.png');

export default function MiniAppsEntry() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isInstalled } = useInstalledMiniApps();
  // Installed apps launch straight into the host from the grid.
  const [runningApp, setRunningApp] = useState<MiniApp | null>(null);
  const [hostVisible, setHostVisible] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
  });
  const apps = data ?? [];

  const goStore = () => router.push('/mini-apps' as any);

  const openApp = useCallback(
    (app: MiniApp) => {
      if (isInstalled(app.slug)) {
        setRunningApp(app);
        setHostVisible(true);
      } else {
        router.push(`/mini-app/${app.slug}` as any);
      }
    },
    [isInstalled, router],
  );

  const closeHost = useCallback(() => setHostVisible(false), []);

  // Until we know, render nothing (avoids layout flash).
  if (isPending) return null;

  const tileW = Math.floor((width - 32 - 3 * GRID_GAP) / 4);
  const iconSize = Math.min(tileW, 64);
  const shown = apps.slice(0, MAX_TILES);

  return (
    <View style={styles.section}>
      <Pressable onPress={goStore} style={styles.headerRow} accessibilityRole="button">
        <Text style={[styles.title, { color: colors.textPrimary }]}>Mini-Apps</Text>
        <View style={styles.seeAll}>
          <Text style={[styles.seeAllText, { color: colors.textSecondary }]}>Mehr entdecken</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </View>
      </Pressable>

      {apps.length === 0 ? (
        <Pressable
          onPress={goStore}
          style={({ pressed }) => [
            styles.banner,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.bannerTitle}>Kleine Apps für Röbel</Text>
          <Text style={styles.bannerText}>
            Entdecke bald Mini-Apps rund um Mitbestimmung, Kultur und Gemeinschaft.
          </Text>
        </Pressable>
      ) : (
        <View style={styles.grid}>
          {shown.map((app) => (
            <MiniAppGridTile
              key={app.id}
              app={app}
              width={tileW}
              iconSize={iconSize}
              onPress={() => openApp(app)}
            />
          ))}

          {/* "Alle" tile — Mini-App-Store icon */}
          <Pressable
            onPress={goStore}
            style={({ pressed }) => [styles.tile, { width: tileW }, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Alle Mini-Apps ansehen"
          >
            <Image
              source={STORE_ICON}
              style={{ width: iconSize, height: iconSize }}
              contentFit="contain"
            />
            <Text style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={1}>
              Alle
            </Text>
          </Pressable>
        </View>
      )}

      {runningApp && <MiniAppHost app={runningApp} visible={hostVisible} onClose={closeHost} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same vertical rhythm as the other Explore sections (they all use
  // marginTop 24 / marginBottom 8 — see MovieSection, MarketplaceSection).
  section: { marginTop: 24, marginBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  title: { fontFamily: 'MonaSansSemiCondensed-Medium', fontSize: 22 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: fontFamily.medium, fontSize: 13 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    columnGap: GRID_GAP,
    rowGap: 20,
  },
  tile: { alignItems: 'center' },
  tileName: {
    marginTop: 8,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: '100%',
  },
  banner: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
  },
  bannerTitle: {
    color: '#fff',
    fontFamily: fontFamily.heading,
    fontSize: 20,
    marginBottom: 6,
  },
  bannerText: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});
