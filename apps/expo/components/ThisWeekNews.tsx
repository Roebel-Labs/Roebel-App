import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import NewsCard from './NewsCard';
import { NewsArticle } from '@/lib/types';
import { isArticleThisWeek } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  articles: NewsArticle[];
};

export default function ThisWeekNews({ articles }: Props) {
  const { colors } = useTheme();

  const thisWeekArticles = useMemo(() => {
    return articles.filter(article => isArticleThisWeek(article.published_at));
  }, [articles]);

  if (thisWeekArticles.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Diese Woche veröffentlicht</Text>
      <FlatList
        horizontal
        data={thisWeekArticles}
        renderItem={({ item }) => <NewsCard article={item} compact={true} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
});
