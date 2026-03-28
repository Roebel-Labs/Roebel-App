import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeftIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { MovieRecord } from '@/lib/types';
import MovieCard from '@/components/MovieCard';
import { useTheme } from '@/context/ThemeContext';

export default function MoviesListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchMovies();
  }, []);

  async function fetchMovies() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('movies')
        .select('*')
        .eq('status', 'published')
        .order('date', { ascending: true });

      if (error) throw error;

      if (data) {
        setMovies(data as MovieRecord[]);
      }
    } catch (error) {
      console.error('Error fetching movies:', error);
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchMovies();
    setRefreshing(false);
  }

  // Separate movies into upcoming and past
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcomingMovies = movies.filter((movie) => {
    const movieDate = new Date(movie.date);
    return movieDate >= now;
  });

  const pastMovies = movies.filter((movie) => {
    const movieDate = new Date(movie.date);
    return movieDate < now;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}>
          <ArrowLeftIcon size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Kinoprogramm</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderSecondary }]}>
          <Text style={[styles.infoBannerTitle, { color: colors.textPrimary }]}>🎬 Moki Güstrow</Text>
          <Text style={[styles.infoBannerText, { color: colors.textSecondary }]}>
            Präsentiert vom Kulturstammtisch mit dem Moki Güstrow, dem
            Engelschen Hof & der "Flotte für Bürger"
          </Text>
          <View style={styles.infoDetails}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textPrimary }]}>Ort:</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                Engelscherhof - Kleine Staffenstraße 9-11
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textPrimary }]}>Einlass:</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>19:00 Uhr</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textPrimary }]}>Beginn:</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>19:30 Uhr</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textPrimary }]}>Preis:</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>5€</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Lade Kinoprogramm...</Text>
          </View>
        ) : (
          <>
            {/* Upcoming Movies */}
            {upcomingMovies.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kommende Filme</Text>
                <View style={styles.moviesGrid}>
                  {upcomingMovies.map((movie) => (
                    <View key={movie.id} style={styles.movieCardWrapper}>
                      <MovieCard movie={movie} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Past Movies */}
            {pastMovies.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Vergangene Filme</Text>
                <View style={styles.moviesGrid}>
                  {pastMovies.map((movie) => (
                    <View key={movie.id} style={styles.movieCardWrapper}>
                      <MovieCard movie={movie} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Empty State */}
            {movies.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>🎬</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Aktuell keine Filme im Programm
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
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
  infoBanner: {
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoBannerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  infoBannerText: {
    fontSize: 14,
    fontFamily: 'Inter',
    lineHeight: 20,
    marginBottom: 12,
  },
  infoDetails: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    width: 80,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: 'Inter',
    flex: 1,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  moviesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  movieCardWrapper: {
    width: '50%',
    paddingHorizontal: 8,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter',
    textAlign: 'center',
  },
});
