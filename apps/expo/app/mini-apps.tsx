/**
 * Mini App Store — the Expo discovery surface (spec §5①).
 *
 * Sections: Empfohlen (horizontal featured rail), Kategorien (filter chips),
 * Suche (live search), Alle Apps (filtered list). Reads live apps from Supabase
 * (`mini_apps where status='live'`) via `fetchLiveMiniApps()`. Tapping a card
 * opens the detail screen; "Öffnen" from there launches the MiniAppHost.
 *
 * Reachable from the Explore tab (see MiniAppsEntry) and via /mini-apps.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ChevronLeft, SearchIcon } from '@/components/miniapp/hostIcons';
import { fetchLiveMiniApps, type MiniApp } from '@/lib/miniapps';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/miniapp-categories';
import { MiniAppFeaturedCard, MiniAppRowCard } from '@/components/miniapp/MiniAppCard';
import type { MiniAppCategory } from '@netizen/miniapp-sdk';
import { useGoBack } from '@/hooks/useGoBack';

export default function MiniAppsStoreScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();

  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<MiniAppCategory | null>(null);

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
      router.push(`/mini-app/${app.slug}` as any);
    },
    [router],
  );

  const featured = useMemo(() => apps.filter((a) => a.featured), [apps]);

  // Categories present in the live set (so we don't show empty filters).
  const presentCategories = useMemo(() => {
    const set = new Set(apps.map((a) => a.category));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [apps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (activeCategory && a.category !== activeCategory) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [apps, query, activeCategory]);

  const searching = query.trim().length > 0 || activeCategory !== null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.headerBtn} hitSlop={10} accessibilityLabel="Zurück">
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mini-Apps</Text>
        <View style={styles.headerBtn} />
      </View>

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
          keyboardShouldPersistTaps="handled"
        >
          {/* Search */}
          <View style={styles.searchWrap}>
            <View style={[styles.searchBar, { backgroundColor: colors.surfaceSecondary }]}>
              <SearchIcon size={18} color={colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Mini-Apps durchsuchen"
                placeholderTextColor={colors.textTertiary}
                style={[styles.searchInput, { color: colors.textPrimary }]}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Category filter chips */}
          {presentCategories.length > 0 && (
            <FlatList
              horizontal
              data={[null, ...presentCategories] as (MiniAppCategory | null)[]}
              keyExtractor={(c) => c ?? 'all'}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
              style={styles.chips}
              renderItem={({ item }) => {
                const isActive = activeCategory === item;
                const label = item ? CATEGORY_LABELS[item] : 'Alle';
                return (
                  <Pressable
                    onPress={() => setActiveCategory(item)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive ? colors.primary : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isActive ? colors.onPrimary : colors.textPrimary },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

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
              {/* Featured rail — only when not actively searching */}
              {!searching && featured.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Empfohlen</Text>
                  <FlatList
                    horizontal
                    data={featured}
                    keyExtractor={(a) => a.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredRow}
                    renderItem={({ item }) => (
                      <MiniAppFeaturedCard app={item} onPress={() => openApp(item)} />
                    )}
                  />
                </View>
              )}

              {/* All / filtered list */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  {searching ? 'Ergebnisse' : 'Alle Apps'}
                </Text>
                {filtered.length === 0 ? (
                  <Text style={[styles.noResults, { color: colors.textSecondary }]}>
                    Keine Mini-Apps gefunden.
                  </Text>
                ) : (
                  filtered.map((app) => (
                    <MiniAppRowCard key={app.id} app={app} onPress={() => openApp(app)} />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.heading,
    fontSize: 20,
  },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    paddingVertical: 0,
  },
  chips: { flexGrow: 0 },
  chipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  section: { marginTop: 16 },
  sectionTitle: {
    paddingHorizontal: 16,
    fontFamily: fontFamily.heading,
    fontSize: 22,
    marginBottom: 12,
  },
  featuredRow: { paddingHorizontal: 16, gap: 12 },
  noResults: {
    paddingHorizontal: 16,
    fontFamily: fontFamily.regular,
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
