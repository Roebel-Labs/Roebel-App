import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ArrowLeftIcon, CalendarIcon, ClockIcon, LocationIcon, TicketIcon, UserIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { MovieRecord } from '@/lib/types';
import { formatDate, formatTime, addMinutesToTime } from '@/lib/utils';
import { SvgXml } from 'react-native-svg';
import MovieCard from '@/components/MovieCard';
import { MovieDetailSkeleton } from '@/components/SkeletonLoader';
import { useTheme } from '@/context/ThemeContext';
import MeckyNotFound from '@/components/MeckyNotFound';

// Play icon SVG component
const PlayIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#ffffff" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [movie, setMovie] = useState<MovieRecord | null>(null);
  const [moreMovies, setMoreMovies] = useState<MovieRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      // Fetch current movie
      const { data, error } = await supabase
        .from('movies')
        .select('id, title, description, date, time, cover_image_url, trailer_youtube_url, fsk, status, created_at, updated_at')
        .eq('id', id)
        .single();

      if (!cancelled) {
        if (error) {
          console.error(error);
          setMovie(null);
        } else {
          setMovie(data as MovieRecord);

          // Fetch more movies (upcoming movies, excluding current one)
          const now = new Date();
          now.setHours(0, 0, 0, 0);

          const { data: moreMoviesData, error: moreMoviesError } = await supabase
            .from('movies')
            .select('id, title, description, date, time, cover_image_url, trailer_youtube_url, fsk, status, created_at, updated_at')
            .eq('status', 'published')
            .neq('id', id)
            .gte('date', now.toISOString().split('T')[0])
            .order('date', { ascending: true })
            .limit(3);

          if (!moreMoviesError && moreMoviesData) {
            setMoreMovies(moreMoviesData as MovieRecord[]);
          }
        }
        setLoading(false);
      }
    }
    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <MovieDetailSkeleton />
      </ScrollView>
    );
  }

  if (!movie) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <MeckyNotFound title="Film nicht gefunden" />
      </View>
    );
  }

  const movieDate = formatDate(movie.date);

  const handleTrailerPress = () => {
    if (movie.trailer_youtube_url) {
      Linking.openURL(movie.trailer_youtube_url).catch((err) => {
        console.error('Error opening trailer:', err);
      });
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.imageSection}>
        {movie.cover_image_url ? (
          <Image
            source={{ uri: movie.cover_image_url }}
            style={[styles.hero, { backgroundColor: colors.cardPlaceholder }]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.heroPlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
        )}

        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.background }]}>
          <ArrowLeftIcon size={24} color={colors.tabIconActive} strokeWidth={1.5} />
        </Pressable>

        <View style={styles.pageIndicator} />
      </View>

      <View style={[styles.contentOverlay, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <View style={styles.titleSection}>
            {movie.fsk && (
              <View style={[styles.fskBadge, { backgroundColor: colors.textPrimary }]}>
                <Text style={[styles.fskText, { color: colors.textInverted }]}>{movie.fsk}</Text>
              </View>
            )}
            <Text style={[styles.title, { color: colors.textPrimary }]}>{movie.title}</Text>
          </View>

          {/* Trailer Button - if available */}
          {movie.trailer_youtube_url && (
            <Pressable style={[styles.trailerButton, { backgroundColor: colors.primary }]} onPress={handleTrailerPress}>
              <PlayIcon size={20} color={colors.onPrimary} />
              <Text style={[styles.trailerButtonText, { color: colors.onPrimary }]}>Trailer ansehen</Text>
            </Pressable>
          )}

          {/* Description Section */}
          {movie.description && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über den Film</Text>
              <Text
                style={[styles.sectionText, { color: colors.textPrimary }]}
                numberOfLines={descriptionExpanded ? undefined : 4}
              >
                {movie.description}
              </Text>
              <Pressable onPress={() => setDescriptionExpanded(!descriptionExpanded)}>
                <Text style={[styles.expandButton, { color: colors.primary }]}>
                  {descriptionExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Info Cards */}
          <View style={styles.infoCards}>
            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.infoIconContainer, { backgroundColor: colors.background }]}>
                <CalendarIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Datum</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{movieDate}</Text>
              </View>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.infoIconContainer, { backgroundColor: colors.background }]}>
                <ClockIcon size={20} color={colors.tabIconActive} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Einlass</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{formatTime(movie.time) ?? '–'} Uhr</Text>
                <Text style={[styles.infoSubValue, { color: colors.textSecondary }]}>Beginn: {addMinutesToTime(movie.time, 30) ?? '–'} Uhr</Text>
              </View>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.infoIconContainer, { backgroundColor: colors.background }]}>
                <LocationIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Ort</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>Engelscherhof</Text>
                <Text style={[styles.infoSubValue, { color: colors.textSecondary }]}>Kleine Staffenstraße 9-11</Text>
              </View>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.infoIconContainer, { backgroundColor: colors.background }]}>
                <TicketIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Preis</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>5€</Text>
              </View>
            </View>
          </View>

          {/* Organizer Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Präsentiert von</Text>
            <View style={[styles.organizerCard, { backgroundColor: colors.surface }]}>
              <View style={styles.organizerHeader}>
                <View style={[styles.organizerIcon, { backgroundColor: colors.background }]}>
                  <UserIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
                </View>
              </View>
              <Text style={[styles.organizerName, { color: colors.textPrimary }]}>
                Mit dem Moki Güstrow, dem Engelschen Hof & der "Flotte für Bürger"
              </Text>
              <Text style={[styles.organizerDescription, { color: colors.textSecondary }]}>Kulturstammtisch</Text>

            </View>
          </View>

          {/* More Movies Section */}
          {moreMovies.length > 0 && (
            <View style={styles.moreMoviesSection}>
              <Text style={[styles.moreMoviesTitle, { color: colors.textPrimary }]}>Weitere Filme</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moreMoviesList}
              >
                {moreMovies.map((moreMovie) => (
                  <MovieCard key={moreMovie.id} movie={moreMovie} compact={true} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  imageSection: {
    height: 550, // Movie poster height
    position: 'relative',
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
  },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    width: 60,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 2,
  },
  contentOverlay: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    minHeight: 600,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter-Medium',
  },
  fskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  fskText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 24,
  },
  trailerButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  infoCards: {
    marginBottom: 24,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  infoSubValue: {
    fontSize: 13,
    fontFamily: 'Inter',
    marginTop: 2,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 16,
    fontFamily: 'Inter',
    lineHeight: 22,
    opacity: 0.85,
    marginBottom: 8,
  },
  expandButton: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 4,
  },
  organizerCard: {
    borderRadius: 12,
    padding: 16,
  },
  organizerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  organizerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  organizerName: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  organizerDescription: {
    fontSize: 14,
    fontFamily: 'Inter',
    lineHeight: 20,
  },
  moreMoviesSection: {
    marginTop: 16,
    marginBottom: 0,
    marginHorizontal: -24, // Negative margin to break out of parent padding
  },
  moreMoviesTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  moreMoviesList: {
    paddingHorizontal: 24,
  },
});
