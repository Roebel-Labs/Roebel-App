/**
 * Mini App Store — the Expo discovery surface (spec §5①), redesigned after the
 * World-App store reference (2026-07-05):
 *
 *   - big left-aligned "Apps" title + circular ⓘ button
 *   - full-width featured hero carousel (feature_image_url or gray
 *     placeholder) with page dots
 *   - "Top-Apps" rows with installed-aware pill buttons (Laden/Öffnen)
 *   - "Neu & bemerkenswert" (newest by created_at)
 *
 * Installed apps launch the MiniAppHost directly from here (no preview page);
 * uninstalled ones go to the detail screen first.
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Alert,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ChevronLeft, InfoIcon } from '@/components/miniapp/hostIcons';
import { fetchLiveMiniApps, type MiniApp } from '@/lib/miniapps';
import { useInstalledMiniApps } from '@/lib/miniapp-installs';
import { MiniAppHeroCard, MiniAppRowCard } from '@/components/miniapp/MiniAppCard';
import MiniAppHost from '@/components/miniapp/MiniAppHost';
import { useGoBack } from '@/hooks/useGoBack';

const HERO_GAP = 12;
const TOP_APPS_PREVIEW = 5;
const NEW_APPS_COUNT = 5;

export default function MiniAppsStoreScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const { width } = useWindowDimensions();
  const { isInstalled } = useInstalledMiniApps();

  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [topExpanded, setTopExpanded] = useState(false);

  // Installed apps open in-place (skip the preview page).
  const [runningApp, setRunningApp] = useState<MiniApp | null>(null);
  const [hostVisible, setHostVisible] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchLiveMiniApps();
    setApps(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchLiveMiniApps();
      if (!cancelled) {
        setApps(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openApp = useCallback(
    (app: MiniApp) => {
      if (isInstalled(app.slug)) {
        setRunningApp(app);
        setHostVisible(true);
      } else {
        router.push(`/mini-app/${app.slug}` as any);
      }
    },
    [router, isInstalled],
  );

  const closeHost = useCallback(() => setHostVisible(false), []);

  const showInfo = useCallback(() => {
    Alert.alert(
      'Mini-Apps',
      'Kleine Apps rund um Röbel — von Mitbestimmung bis Spiele. Einmal geladen, öffnen sie sich direkt aus der Übersicht.',
    );
  }, []);

  // Hero: featured apps first; fall back to the whole list so the carousel
  // never renders empty while apps exist.
  const heroApps = useMemo(() => {
    const featured = apps.filter((a) => a.featured);
    return (featured.length > 0 ? featured : apps).slice(0, 5);
  }, [apps]);

  const newApps = useMemo(
    () =>
      [...apps]
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
        .slice(0, NEW_APPS_COUNT),
    [apps],
  );

  const topApps = topExpanded ? apps : apps.slice(0, TOP_APPS_PREVIEW);

  const heroW = width - 32;
  const onHeroScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / (heroW + HERO_GAP));
      setHeroIndex(Math.max(0, Math.min(idx, heroApps.length - 1)));
    },
    [heroW, heroApps.length],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header: back — big "Apps" — ⓘ */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.headerBtn} hitSlop={10} accessibilityLabel="Zurück">
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={showInfo}
          style={[styles.infoBtn, { backgroundColor: colors.surfaceSecondary }]}
          hitSlop={8}
          accessibilityLabel="Was sind Mini-Apps?"
        >
          <InfoIcon size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
      <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Apps</Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {apps.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Noch keine Mini-Apps
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Hier erscheinen bald kleine Apps rund um Röbel — von Mitbestimmung bis Spiele.
              </Text>
            </View>
          ) : (
            <>
              {/* Featured hero carousel */}
              {heroApps.length > 0 && (
                <View style={styles.heroSection}>
                  <FlatList
                    horizontal
                    data={heroApps}
                    keyExtractor={(a) => a.id}
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={heroW + HERO_GAP}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    onMomentumScrollEnd={onHeroScroll}
                    contentContainerStyle={styles.heroRow}
                    renderItem={({ item }) => (
                      <MiniAppHeroCard
                        app={item}
                        width={heroW}
                        installed={isInstalled(item.slug)}
                        onPress={() => openApp(item)}
                      />
                    )}
                  />
                  {heroApps.length > 1 && (
                    <View style={styles.dots}>
                      {heroApps.map((a, i) => (
                        <View
                          key={a.id}
                          style={[
                            styles.dot,
                            {
                              backgroundColor:
                                i === heroIndex ? colors.textSecondary : colors.border,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Top-Apps */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top-Apps</Text>
                  {apps.length > TOP_APPS_PREVIEW && (
                    <Pressable onPress={() => setTopExpanded((v) => !v)} hitSlop={8}>
                      <Text style={[styles.seeAll, { color: colors.textSecondary }]}>
                        {topExpanded ? 'Weniger anzeigen' : 'Alle anzeigen'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {topApps.map((app) => (
                  <MiniAppRowCard
                    key={app.id}
                    app={app}
                    installed={isInstalled(app.slug)}
                    onPress={() => openApp(app)}
                  />
                ))}
              </View>

              {/* Neu & bemerkenswert */}
              {newApps.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                      Neu & bemerkenswert
                    </Text>
                  </View>
                  {newApps.map((app) => (
                    <MiniAppRowCard
                      key={app.id}
                      app={app}
                      installed={isInstalled(app.slug)}
                      onPress={() => openApp(app)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Host for installed apps launched straight from the store */}
      {runningApp && <MiniAppHost app={runningApp} visible={hostVisible} onClose={closeHost} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pageTitle: {
    paddingHorizontal: 16,
    fontFamily: fontFamily.heading,
    fontSize: 34,
    marginBottom: 12,
  },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroSection: { marginTop: 4 },
  heroRow: { paddingHorizontal: 16, gap: HERO_GAP },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  section: { marginTop: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 20,
  },
  seeAll: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  emptyBox: {
    paddingHorizontal: 32,
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
