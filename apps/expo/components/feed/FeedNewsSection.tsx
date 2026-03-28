import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import NewsSection from '@/components/NewsSection';
import type { NewsArticle } from '@/lib/types';

type Props = {
  articles: NewsArticle[];
};

export default function FeedNewsSection({ articles }: Props) {
  const { colors } = useTheme();

  if (articles.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NewsSection articles={articles} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 8,
  },
});
