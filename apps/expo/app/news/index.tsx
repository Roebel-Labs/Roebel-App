import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { NewsArticle } from '@/lib/types';
import NewsCard from '@/components/NewsCard';
import { NewsCardSkeleton } from '@/components/SkeletonLoader';
import BottomNavigation from '@/components/BottomNavigation';
import { GlassBackdrop, GlassProvider } from '@/components/GlassSurface';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import NewsletterSignupCard from '@/components/news/NewsletterSignupCard';
import { APP_UPDATE_CATEGORY } from '@/lib/newsletter';

type NewsFilter = 'all' | 'town' | 'app';
const FILTERS: Array<{ key: NewsFilter; label: string }> = [
  { key: 'all', label: 'Alle' },
  { key: 'town', label: 'Aus Röbel' },
  { key: 'app', label: 'Neu in der App' },
];

export default function NewsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<NewsFilter>('all');

  const visibleArticles = articles.filter((article) => {
    if (filter === 'all') return true;
    const isAppUpdate = article.category === APP_UPDATE_CATEGORY;
    return filter === 'app' ? isAppUpdate : !isAppUpdate;
  });

  useEffect(() => {
    fetchArticles();
  }, []);

  async function fetchArticles() {
    try {
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (data) {
        setArticles(data as NewsArticle[]);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching articles:', error);
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchArticles();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <GlassProvider>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>News</Text>
        <View style={styles.headerSpacer} />
      </View>

            {/* GlassBackdrop: sampling surface for the frosted bottom nav (Android). */}
      <GlassBackdrop style={{ flex: 1 }}>
<ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? colors.primary : colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.filterText, { color: active ? colors.onPrimary : colors.textPrimary }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.articlesSection}>
            <NewsCardSkeleton />
            <NewsCardSkeleton />
            <NewsCardSkeleton />
            <NewsCardSkeleton />
          </View>
        )}

        {/* Articles List */}
        {!loading && (
          <View style={styles.articlesSection}>
            {visibleArticles.length > 0 ? (
              visibleArticles.map((article) => (
                <NewsCard key={article.id} article={article} horizontal />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                  {filter === 'app' ? 'Der erste Beitrag erscheint in Kürze' : 'Keine Artikel verfügbar'}
                </Text>
              </View>
            )}
            <NewsletterSignupCard />
          </View>
        )}
      </ScrollView>
      </GlassBackdrop>

      <View style={styles.navOverlay}>
        <BottomNavigation
          activeTab="home"
          onTabPress={(tab) => {
            if (tab === 'home') router.replace('/');
            else if (tab === 'explore') router.push('/explore');
            else if (tab === 'map') router.push('/location');
            else if (tab === 'profile') router.push('/profile');
          }} glass />
      </View>
    </GlassProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  navOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
    paddingTop: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  filterChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterText: {
    fontSize: 14,
    fontFamily: 'MonaSans-Medium',
  },
  articlesSection: {
    paddingHorizontal: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
});
