import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { MovieRecord } from '@/lib/types';
import MovieCard from './MovieCard';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { ArrowRight02Icon } from './Icons';

type Props = {
  movies: MovieRecord[];
};

export default function MovieSection({ movies }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  // Get upcoming published movies sorted by date
  const upcomingMovies = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    return movies
      .filter(movie => movie.status === 'published')
      .filter(movie => {
        const movieDate = new Date(movie.date);
        return movieDate >= now;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
      })
      .slice(0, 6); // Show max 6 movies in horizontal scroll
  }, [movies]);

  if (upcomingMovies.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kinoprogramm</Text>
        <Pressable
          style={[styles.viewAllButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={() => router.push('/movies' as any)}
          accessibilityRole="button"
          accessibilityLabel="Alle Filme anzeigen"
        >
          <ArrowRight02Icon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={upcomingMovies}
        renderItem={({ item }) => <MovieCard movie={item} compact={true} />}
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
    fontFamily: 'Inter-Medium',
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
