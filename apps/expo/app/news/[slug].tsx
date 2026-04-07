import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeftIcon, ShareIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { NewsArticle } from '@/lib/types';
import { formatPublishDate, calculateReadTime } from '@/lib/utils';
import RichTextRenderer from '@/components/RichTextRenderer';
import { NewsDetailSkeleton } from '@/components/SkeletonLoader';
import NewsCard from '@/components/NewsCard';
import ImageZoomModal from '@/components/ImageZoomModal';
import { logNewsView, logEvent } from '@/lib/firebase';
import { useTheme } from '@/context/ThemeContext';

export default function NewsDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
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
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Artikel nicht gefunden</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>Artikel nicht gefunden</Text>
          <Pressable
            style={[styles.returnButton, { backgroundColor: colors.primary }]}
            onPress={goBack}
          >
            <Text style={[styles.returnButtonText, { color: colors.onPrimary }]}>Zurück zur Übersicht</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const publishDate = formatPublishDate(article.published_at);
  const readTime = calculateReadTime(article.content);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}>
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}></Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Cover Image */}
        {article.cover_image_url ? (
          <Pressable onPress={() => setImageZoomVisible(true)}>
            <Image
              source={{ uri: article.cover_image_url }}
              style={styles.coverImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        ) : (
          <View style={[styles.coverImagePlaceholder, { backgroundColor: colors.surface }]}>
            <Ionicons name="document-text" size={64} color={colors.textTertiary} />
          </View>
        )}

        {/* Content Container */}
        <View style={styles.contentContainer}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{article.title}</Text>

          {/* Meta Information */}
          <View style={styles.metaContainer}>
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{article.author_name}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{readTime}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{publishDate}</Text>
            </View>
          </View>

          {/* View Count */}
          <View style={styles.viewCountContainer}>
            <Ionicons name="eye-outline" size={16} color={colors.textTertiary} />
            <Text style={[styles.viewCountText, { color: colors.textTertiary }]}>{article.view_count} Aufrufe</Text>
          </View>

          {/* Excerpt */}
          {article.excerpt && (
            <Text style={[styles.excerpt, { color: colors.textSecondary }]}>{article.excerpt}</Text>
          )}

          {/* Rich Text Content */}
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

          {/* Share Button */}
          <Pressable style={[styles.shareButton, { backgroundColor: colors.surfaceSecondary }]} onPress={handleShare}>
            <ShareIcon size={18} color={colors.textSecondary} />
            <Text style={[styles.shareButtonText, { color: colors.textSecondary }]}>Teilen</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Image Zoom Modal */}
      {article.cover_image_url && (
        <ImageZoomModal
          visible={imageZoomVisible}
          imageUrl={article.cover_image_url}
          onClose={() => setImageZoomVisible(false)}
        />
      )}
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
    fontFamily: 'Inter-Medium',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  loadingContainer: {
    padding: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
  },
  returnButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  returnButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  coverImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  coverImagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    padding: 16,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
    lineHeight: 40,
  },
  metaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
  },
  viewCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  viewCountText: {
    fontSize: 13,
  },
  excerpt: {
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 24,
    fontStyle: 'italic',
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
    fontFamily: 'Inter-SemiBold',
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
    fontFamily: 'Inter-SemiBold',
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
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 40,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  shareButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
