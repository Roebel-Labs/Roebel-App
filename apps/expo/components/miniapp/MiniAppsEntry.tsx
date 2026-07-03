/**
 * MiniAppsEntry — the discovery entry point for the Mini App store, shown on the
 * Explore tab. A section header + a horizontal rail of the first few live apps
 * ending in a "Alle ansehen" tile → /mini-apps. If no live apps exist, renders a
 * single promo banner so the store is still discoverable.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ChevronLeft } from '@/components/miniapp/hostIcons';
import { fetchLiveMiniApps, type MiniApp } from '@/lib/miniapps';
import { MiniAppFeaturedCard } from '@/components/miniapp/MiniAppCard';

export default function MiniAppsEntry() {
  const { colors } = useTheme();
  const router = useRouter();
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLiveMiniApps().then((data) => {
      if (!cancelled) {
        setApps(data);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goStore = () => router.push('/mini-apps' as any);

  // Until we know, render nothing (avoids layout flash).
  if (!loaded) return null;

  return (
    <View style={styles.section}>
      <Pressable onPress={goStore} style={styles.headerRow} accessibilityRole="button">
        <Text style={[styles.title, { color: colors.textPrimary }]}>Mini-Apps</Text>
        <View style={styles.seeAll}>
          <Text style={[styles.seeAllText, { color: colors.textSecondary }]}>Alle ansehen</Text>
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <ChevronLeft size={16} color={colors.textSecondary} />
          </View>
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
        <FlatList
          horizontal
          data={apps.slice(0, 6)}
          keyExtractor={(a) => a.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          renderItem={({ item }) => (
            <MiniAppFeaturedCard
              app={item}
              onPress={() => router.push(`/mini-app/${item.slug}` as any)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { fontFamily: fontFamily.heading, fontSize: 22 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: fontFamily.medium, fontSize: 13 },
  row: { paddingHorizontal: 16, gap: 12 },
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
