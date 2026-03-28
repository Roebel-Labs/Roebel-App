import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import MovieSection from '@/components/MovieSection';
import type { MovieRecord } from '@/lib/types';

type Props = {
  movies: MovieRecord[];
};

export default function FeedCinemaSection({ movies }: Props) {
  const { colors } = useTheme();

  if (movies.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MovieSection movies={movies} />
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
