import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { ArrowLeftIcon } from '@/components/Icons';
import {
  listPublishedFeed,
  type BlogArticleWithAccount,
} from '@/lib/supabase-blog-articles';
import { SUB_TYPE_EMOJI } from '@/lib/types';
import BottomNavigation from '@/components/BottomNavigation';

export default function BlogFeedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [articles, setArticles] = useState<BlogArticleWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const data = await listPublishedFeed();
    setArticles(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Blog</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Beiträge von Organisationen aus Röbel und Umgebung.
        </Text>

        {loading ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.textTertiary }}>Lade Artikel…</Text>
          </View>
        ) : articles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.textTertiary, fontSize: 15 }}>
              Noch keine Beiträge.
            </Text>
          </View>
        ) : (
          articles.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => router.push(`/blog/${a.id}` as any)}
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.7 },
              ]}
            >
              {a.cover_image_url ? (
                <Image
                  source={{ uri: a.cover_image_url }}
                  style={styles.cover}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.coverPlaceholder,
                    { backgroundColor: colors.surfaceSecondary },
                  ]}
                >
                  <Text style={styles.coverPlaceholderText}>📝</Text>
                </View>
              )}
              <Text
                style={[styles.title, { color: colors.textPrimary }]}
                numberOfLines={2}
              >
                {a.title}
              </Text>
              {a.excerpt ? (
                <Text
                  style={[styles.excerpt, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {a.excerpt}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text
                  style={[styles.metaAuthor, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {a.account
                    ? `${
                        a.account.sub_type ? SUB_TYPE_EMOJI[a.account.sub_type] : '🏢'
                      } ${a.account.name}`
                    : 'Organisation'}
                </Text>
                <Text style={[styles.metaDate, { color: colors.textTertiary }]}>
                  {a.published_at
                    ? new Date(a.published_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: 'short',
                      })
                    : ''}
                </Text>
              </View>
            </Pressable>
          ))
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
  container: { flex: 1 },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontFamily: 'Inter-Medium' },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  subheading: { fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 16 },
  empty: { padding: 40, alignItems: 'center' },
  card: { marginBottom: 24 },
  cover: { width: '100%', height: 180, borderRadius: 12 },
  coverPlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPlaceholderText: { fontSize: 28 },
  title: { fontSize: 18, fontFamily: 'Inter-Medium', marginTop: 12 },
  excerpt: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  metaAuthor: { fontSize: 13, fontFamily: 'Inter-Regular', flex: 1 },
  metaDate: { fontSize: 13, fontFamily: 'Inter-Regular' },
});
