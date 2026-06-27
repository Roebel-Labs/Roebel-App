import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { NewsArticle } from '@/lib/types';
import NewsCard from './NewsCard';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { ArrowRight02Icon } from './Icons';

type Props = {
  articles: NewsArticle[];
};

export default function NewsSection({ articles }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  // Get the 3 most recent published articles
  const recentArticles = useMemo(() => {
    return articles
      .filter(article => article.status === 'published')
      .sort((a, b) => {
        const dateA = new Date(a.published_at || a.created_at).getTime();
        const dateB = new Date(b.published_at || b.created_at).getTime();
        return dateB - dateA;
      })
      .slice(0, 3);
  }, [articles]);

  if (recentArticles.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Neuigkeiten</Text>
        <Pressable
          style={[styles.viewAllButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={() => router.push('/news' as any)}
          accessibilityRole="button"
          accessibilityLabel="Alle Neuigkeiten anzeigen"
        >
          <ArrowRight02Icon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={recentArticles}
        renderItem={({ item }) => <NewsCard article={item} compact={true} />}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  viewAllButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
  },
});
