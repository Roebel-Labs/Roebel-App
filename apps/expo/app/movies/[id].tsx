import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { ArrowLeftIcon, CalendarIcon, UserIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { MovieRecord } from '@/lib/types';
import { formatDate, formatTime, addMinutesToTime } from '@/lib/utils';
import { requestCalendarPermission, saveEventToCalendar } from '@/lib/calendar';
import { useSnackbar } from '@/context/SnackbarContext';
import { useGoBack } from '@/hooks/useGoBack';
import MovieCard from '@/components/MovieCard';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import ImageZoomModal from '@/components/ImageZoomModal';
import { MovieDetailSkeleton } from '@/components/SkeletonLoader';
import { useTheme } from '@/context/ThemeContext';
import MeckyNotFound from '@/components/MeckyNotFound';
import { fontFamily } from '@/constants/theme';

const GUTTER = 16;
const POSTER_RADIUS = 12;
/** Cinema posters are 2:3 (width / height) until the image reports its size. */
const POSTER_ASPECT_DEFAULT = 2 / 3;
const POSTER_MAX_HEIGHT_RATIO = 0.6;
/** The ambient blur keeps running this far below the poster block. */
const AMBIENT_TAIL = 160;
const FOOTER_BUTTON_HEIGHT = 54;

// The cinema evenings are a fixed series; venue and price do not live on the row.
const VENUE_NAME = 'Engelscher Hof';
const VENUE_ADDRESS = 'Kleine Staffenstraße 9-11, Röbel';
const TICKET_PRICE = '5 €';
const PRESENTER = 'Kulturstammtisch';
const PRESENTER_LINE = 'Mit dem Moki Güstrow, dem Engelschen Hof & der "Flotte für Bürger"';

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
  const goBack = useGoBack();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { showSnackbar } = useSnackbar();
  const [movie, setMovie] = useState<MovieRecord | null>(null);
  const [moreMovies, setMoreMovies] = useState<MovieRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [zoomVisible, setZoomVisible] = useState(false);
  const [posterAspect, setPosterAspect] = useState(POSTER_ASPECT_DEFAULT);
  const [heroHeight, setHeroHeight] = useState(0);

  const onHeroLayout = useCallback((e: LayoutChangeEvent) => {
    setHeroHeight(e.nativeEvent.layout.height);
  }, []);

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

  const handleSaveToCalendar = async () => {
    if (!movie) return;
    try {
      const granted = await requestCalendarPermission();
      if (!granted) {
        showSnackbar({ message: 'Kalender-Zugriff wurde nicht erlaubt', duration: 4000 });
        return;
      }
      await saveEventToCalendar({
        title: `Kino: ${movie.title}`,
        description: movie.description,
        date: movie.date,
        time: movie.time,
        endTime: null,
        location: `${VENUE_NAME}, ${VENUE_ADDRESS}`,
      });
      showSnackbar({ message: 'Zum Kalender hinzugefügt', duration: 4000 });
    } catch (error) {
      console.error('Error saving to calendar:', error);
      showSnackbar({ message: 'Fehler beim Speichern in den Kalender', duration: 4000 });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <MovieDetailSkeleton />
      </View>
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

  const admission = formatTime(movie.time);
  const start = addMinutesToTime(movie.time, 30);
  const whenLine =
    formatDate(movie.date) +
    (admission ? ` • Einlass ${admission}${start ? `, Beginn ${start}` : ''} Uhr` : '');
  const hasTrailer = !!movie.trailer_youtube_url;
  const hasAmbient = !!movie.cover_image_url;
  const chromeColor = hasAmbient ? '#ffffff' : colors.textPrimary;

  const maxPosterWidth = screenWidth - GUTTER * 2;
  const posterWidth = Math.min(maxPosterWidth, screenHeight * POSTER_MAX_HEIGHT_RATIO * posterAspect);
  const posterHeight = posterWidth / posterAspect;

  const handleTrailerPress = () => {
    if (movie.trailer_youtube_url) {
      Linking.openURL(movie.trailer_youtube_url).catch((err) => {
        console.error('Error opening trailer:', err);
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingBottom: (hasTrailer ? FOOTER_BUTTON_HEIGHT + 48 : 24) + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {hasAmbient && heroHeight > 0 && movie.cover_image_url && (
          <AmbientBackdrop uri={movie.cover_image_url} height={heroHeight + AMBIENT_TAIL} />
        )}

        <View style={[styles.hero, { paddingTop: insets.top + 6 }]} onLayout={onHeroLayout}>
          <View style={styles.topBar}>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              style={({ pressed }) => [styles.chromeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Zurück"
            >
              <ArrowLeftIcon size={26} color={chromeColor} strokeWidth={1.8} />
            </Pressable>
            <View style={styles.chromeBtn} />
          </View>

          <View style={[styles.posterWrap, { width: posterWidth, height: posterHeight }]}>
            <Pressable
              onPress={() => setZoomVisible(true)}
              disabled={!movie.cover_image_url}
              style={[styles.poster, { backgroundColor: colors.cardPlaceholder }]}
              accessibilityRole="imagebutton"
              accessibilityLabel="Filmplakat vergrößern"
            >
              {movie.cover_image_url ? (
                <Image
                  source={{ uri: movie.cover_image_url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  priority="high"
                  accessibilityIgnoresInvertColors
                  onLoad={(e) => {
                    const { width, height } = e.source;
                    if (width && height) setPosterAspect(width / height);
                  }}
                />
              ) : (
                <View style={styles.posterPlaceholder}>
                  <Text style={styles.posterPlaceholderText}>🎬</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.headerBlock}>
          <View style={styles.hostRow}>
            <View style={styles.host}>
              <View style={[styles.hostAvatar, { backgroundColor: colors.surfaceSecondary }]}>
                <UserIcon size={14} color={colors.tabIconActive} strokeWidth={1.5} />
              </View>
              <Text style={[styles.hostName, { color: colors.textPrimary }]} numberOfLines={1}>
                {PRESENTER}
              </Text>
            </View>
            <Pressable
              onPress={handleSaveToCalendar}
              hitSlop={8}
              style={({ pressed }) => [styles.chromeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Zum Kalender hinzufügen"
            >
              <CalendarIcon size={22} color={colors.textPrimary} strokeWidth={1.5} />
            </Pressable>
          </View>

          {movie.fsk && (
            <View style={[styles.fskBadge, { backgroundColor: colors.textPrimary }]}>
              <Text style={[styles.fskText, { color: colors.textInverted }]}>{movie.fsk}</Text>
            </View>
          )}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{movie.title}</Text>

          <Text style={[styles.place, { color: colors.textPrimary }]}>{VENUE_NAME}</Text>
          <Text style={[styles.when, { color: colors.textSecondary }]}>{VENUE_ADDRESS}</Text>
          <Text style={[styles.when, { color: colors.textSecondary }]}>{whenLine}</Text>
          <Text style={[styles.when, { color: colors.textSecondary }]}>Eintritt {TICKET_PRICE}</Text>
        </View>

        <View style={styles.sections}>
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

          {/* Organizer Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Präsentiert von</Text>
            <View style={[styles.organizerCard, { borderColor: colors.border }]}>
              <View style={styles.organizerHeader}>
                <View style={[styles.organizerIcon, { backgroundColor: colors.surfaceSecondary }]}>
                  <UserIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
                </View>
                <Text style={[styles.organizerName, { color: colors.textPrimary }]}>{PRESENTER}</Text>
              </View>
              <Text style={[styles.organizerDescription, { color: colors.textSecondary }]}>
                {PRESENTER_LINE}
              </Text>
            </View>
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
      </ScrollView>

      {/* Sticky footer: the trailer is the one action a film page has. */}
      {hasTrailer && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <LinearGradient
            colors={[`${colors.background}00`, colors.background]}
            locations={[0, 0.55]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Pressable
            style={({ pressed }) => [
              styles.trailerButton,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
            ]}
            onPress={handleTrailerPress}
            accessibilityRole="button"
            accessibilityLabel="Trailer ansehen"
          >
            <PlayIcon size={20} color={colors.onPrimary} />
            <Text style={[styles.trailerButtonText, { color: colors.onPrimary }]}>Trailer ansehen</Text>
          </Pressable>
        </View>
      )}

      {movie.cover_image_url && (
        <ImageZoomModal
          visible={zoomVisible}
          imageUrl={movie.cover_image_url}
          onClose={() => setZoomVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  hero: {
    paddingHorizontal: GUTTER,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
  },
  chromeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterWrap: {
    alignSelf: 'center',
    marginTop: 10,
  },
  poster: {
    ...StyleSheet.absoluteFill,
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
  },
  posterPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    fontSize: 56,
  },
  headerBlock: {
    paddingHorizontal: GUTTER,
    paddingTop: 20,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  host: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hostAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostName: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  fskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  fskText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: fontFamily.heading,
    marginBottom: 12,
  },
  place: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: fontFamily.semiBold,
    marginBottom: 4,
  },
  when: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fontFamily.regular,
  },
  sections: {
    paddingHorizontal: GUTTER,
    paddingTop: 28,
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
    fontFamily: fontFamily.regular,
    lineHeight: 22,
    opacity: 0.85,
    marginBottom: 8,
  },
  expandButton: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    marginTop: 4,
  },
  organizerCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
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
    fontFamily: fontFamily.medium,
  },
  organizerDescription: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    lineHeight: 20,
  },
  moreMoviesSection: {
    marginTop: 16,
  },
  moreMoviesTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 12,
    paddingHorizontal: GUTTER,
  },
  moreMoviesList: {
    paddingHorizontal: GUTTER,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
    paddingHorizontal: GUTTER,
  },
  trailerButton: {
    height: FOOTER_BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  trailerButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.heading,
  },
});
