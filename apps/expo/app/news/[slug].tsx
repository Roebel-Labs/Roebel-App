import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Share,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeftIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { NewsArticle } from '@/lib/types';
import { estimateListenMinutes } from '@/lib/news-audio';
import ArticleListenRow from '@/components/news/ArticleListenRow';
import { fontFamily } from '@/constants/theme';
import RichTextRenderer from '@/components/RichTextRenderer';
import { NewsDetailSkeleton } from '@/components/SkeletonLoader';
import NewsCard from '@/components/NewsCard';
import MeckyNotFound from '@/components/MeckyNotFound';
import ImageZoomModal from '@/components/ImageZoomModal';
import { logNewsView, logEvent } from '@/lib/firebase';
import { useTheme } from '@/context/ThemeContext';

export default function NewsDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageZoomVisible, setImageZoomVisible] = useState(false);

  useEffect(() => {
    if (slug) {
      fetchArticle();
    }
  }, [slug]);

  async function fetchArticle() {
    try {
      setLoading(true);

      // Fetch the article
      const { data: articleData, error: articleError } = await supabase
        .from('news_articles')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

      if (articleError) throw articleError;

      if (articleData) {
        const typedArticleData = articleData as NewsArticle;
        setArticle(typedArticleData);
        logNewsView(typedArticleData.slug, typedArticleData.title);

        // Increment view count
        const newViewCount = typedArticleData.view_count + 1;
        // @ts-ignore - Supabase type issue with update
        await supabase
          .from('news_articles')
          .update({ view_count: newViewCount })
          .eq('id', typedArticleData.id);

        // Fetch related articles (same category, exclude current article)
        if (typedArticleData.category) {
          const { data: relatedData } = await supabase
            .from('news_articles')
            .select('*')
            .eq('status', 'published')
            .eq('category', typedArticleData.category)
            .neq('id', typedArticleData.id)
            .order('published_at', { ascending: false })
            .limit(3);

          if (relatedData) {
            setRelatedArticles(relatedData);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching article:', error);
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchArticle();
    setRefreshing(false);
  }

  const handleShare = async () => {
    if (!article) return;

    try {
      await Share.share({
        message: `${article.title}\n\nhttps://www.roebel.app/news/${slug}`,
        title: article.title,
      });
      logEvent('share_news', { slug: article.slug, title: article.title });
    } catch (error) {
      console.error('Error sharing article:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Artikel</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.loadingContainer}>
          <NewsDetailSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!article) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Artikel</Text>
          <View style={styles.headerSpacer} />
        </View>
        <MeckyNotFound title="Artikel nicht gefunden" />
      </SafeAreaView>
    );
  }

  const publishDate = article.published_at
    ? format(parseISO(article.published_at), 'd. MMMM yyyy', { locale: de })
    : null;
  const kicker = (article.category?.trim() || 'Röbel News').toUpperCase();
  const listenMinutes = estimateListenMinutes([article.title, article.excerpt, article.content]);

  const handleMore = () => {
    Alert.alert(article.title, undefined, [
      { text: 'Teilen', onPress: handleShare },
      { text: 'Feedback geben', onPress: () => router.push('/feedback') },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={insets.top} />
        }
      >
        {/* Hero: blurred cover as backdrop, the cover itself inset on top */}
        {article.cover_image_url ? (
          <Pressable
            onPress={() => setImageZoomVisible(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel="Titelbild vergrößern"
            style={[styles.hero, { backgroundColor: colors.surface }]}
          >
            <Image
              source={{ uri: article.cover_image_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={40}
              accessibilityIgnoresInvertColors
            />
            <View style={[styles.heroInset, { paddingTop: insets.top + 56 }]}>
              <Image
                source={{ uri: article.cover_image_url }}
                style={styles.heroImage}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <LinearGradient
              colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
              style={[styles.heroScrim, { height: insets.top + 72 }]}
              pointerEvents="none"
            />
          </Pressable>
        ) : (
          <View style={{ height: insets.top + 64 }} />
        )}

        <View style={styles.contentContainer}>
          {/* Kicker */}
          <View style={styles.kickerRow}>
            <Image source={require('@/assets/images/icon.png')} style={styles.kickerIcon} />
            <Text style={[styles.kicker, { color: colors.textPrimary }]} numberOfLines={1}>
              {kicker}
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{article.title}</Text>

          {article.excerpt ? (
            <Text style={[styles.excerpt, { color: colors.textPrimary }]}>{article.excerpt}</Text>
          ) : null}

          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {[publishDate, article.author_name ? `Von ${article.author_name}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          {/* Read out loud */}
          <ArticleListenRow
            slug={article.slug}
            estimatedMinutes={listenMinutes}
            onMore={handleMore}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.richTextContainer}>
            <RichTextRenderer content={article.content} />
          </View>

          {/* Author Contact Card */}
          {article.author_email && (
            <View style={[styles.authorCard, { backgroundColor: colors.pressedOverlay }]}>
              <View style={styles.authorInfo}>
                <Ionicons name="person-circle-outline" size={48} color={colors.primary} />
                <View style={styles.authorDetails}>
                  <Text style={[styles.authorName, { color: colors.textPrimary }]}>{article.author_name}</Text>
                  <Text style={[styles.authorRole, { color: colors.textPrimary }]}>Autor</Text>
                </View>
              </View>
              <View style={styles.authorButtons}>
                <Pressable
                  style={[styles.feedbackButton, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/feedback')}
                >
                  <Ionicons name="chatbox-outline" size={20} color={colors.onPrimary} />
                  <Text style={[styles.feedbackButtonText, { color: colors.onPrimary }]}>Feedback</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Related Articles */}
          {relatedArticles.length > 0 && (
            <View style={[styles.relatedSection, { borderTopColor: colors.borderSecondary }]}>
              <Text style={[styles.relatedTitle, { color: colors.textPrimary }]}>Ähnliche Artikel</Text>
              {relatedArticles.map((relatedArticle) => (
                <NewsCard key={relatedArticle.id} article={relatedArticle} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating back chevron over the hero */}
      <Pressable
        onPress={goBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Zurück"
        style={[styles.floatingBack, { top: insets.top + 8 }]}
      >
        <Ionicons
          name="chevron-back"
          size={30}
          color={article.cover_image_url ? '#FFFFFF' : colors.textPrimary}
        />
      </Pressable>

      {/* Image Zoom Modal */}
      {article.cover_image_url && (
        <ImageZoomModal
          visible={imageZoomVisible}
          imageUrl={article.cover_image_url}
          onClose={() => setImageZoomVisible(false)}
        />
      )}
    </View>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  scrollContent: {},
  loadingContainer: {
    padding: 16,
  },
  hero: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
  },
  heroInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  heroImage: {
    flex: 1,
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  floatingBack: {
    position: 'absolute',
    left: 12,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  kickerIcon: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  kicker: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.medium,
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: fontFamily.heading,
    marginBottom: 12,
  },
  excerpt: {
    fontSize: 18,
    lineHeight: 26,
    fontFamily: fontFamily.regular,
    marginBottom: 10,
  },
  meta: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 24,
  },
  richTextContainer: {
    marginBottom: 32,
  },
  tagsContainer: {
    marginBottom: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  tagsLabel: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
  },
  authorCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  authorDetails: {
    gap: 4,
  },
  authorName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  authorRole: {
    fontSize: 14,
  },
  authorButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  contactButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  feedbackButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  relatedSection: {
    marginTop: 32,
    paddingTop: 32,
    borderTopWidth: 1,
  },
  relatedTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
  },
});
