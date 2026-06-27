import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { NewsArticle } from '@/lib/types';
import NewsCard from '@/components/NewsCard';
import { NewsCardSkeleton } from '@/components/SkeletonLoader';
import BottomNavigation from '@/components/BottomNavigation';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';

export default function NewsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
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
            {articles.length > 0 ? (
              articles.map((article) => (
                <NewsCard key={article.id} article={article} horizontal />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Keine Artikel verfügbar</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <BottomNavigation
        activeTab="home"
        onTabPress={(tab) => {
          if (tab === 'home') router.replace('/');
          else if (tab === 'explore') router.push('/explore');
          else if (tab === 'map') router.push('/location');
          else if (tab === 'profile') router.push('/profile');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    paddingBottom: 100,
    paddingTop: 16,
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
