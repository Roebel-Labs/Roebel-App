import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchThisWeekEvents } from '@/lib/supabase-posts';
import type { EventRecord } from '@/lib/types';
import {
  fetchHomeFeedStoryCollections,
  fetchSlidesForCollection,
  type StoryCollection,
  type StorySlide,
} from '@/lib/supabase-story-collections';
import StoryViewer, {
  type StoryGroup,
  type StorySlideInput,
} from './StoryViewer';

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatWeekdayLong(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { weekday: 'long' });
}

export default function HomeStoryBar() {
  const { colors } = useTheme();
  const router = useRouter();

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [collections, setCollections] = useState<StoryCollection[]>([]);
  const [collectionSlides, setCollectionSlides] = useState<
    Record<string, StorySlide[]>
  >({});
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchThisWeekEvents().then((data) => setEvents(data as EventRecord[]));
    fetchHomeFeedStoryCollections().then(async (cols) => {
      setCollections(cols);
      // Pre-fetch all slides upfront — admin-curated, small list.
      const results = await Promise.all(
        cols.map((c) =>
          fetchSlidesForCollection(c.id).then((s) => [c.id, s] as const),
        ),
      );
      setCollectionSlides(Object.fromEntries(results));
    });
  }, []);

  // ── Build group sequence ────────────────────────────────────
  // ONE events group (all events as ordered slides, grouped progress bars
  // at the top show one segment per event) + one group per collection.
  const groups = useMemo<StoryGroup[]>(() => {
    const result: StoryGroup[] = [];

    if (events.length > 0) {
      const eventSlides: StorySlideInput[] = events.map((event) => {
        const orgName = event.account?.name ?? event.organizer_name;
        const orgAvatar = (event.account as any)?.avatar_url ?? null;
        return {
          backgroundUrl: event.image_url ?? '',
          imageFit: 'contain',
          pillText: formatWeekdayLong(event.date),
          title: event.title,
          subtitleLine: event.location || undefined,
          header: {
            avatarUrl: orgAvatar,
            title: orgName,
            subtitle: formatEventDate(event.date),
          },
          onSwipeUp: () => {
            router.push(`/event/${event.id}` as any);
            setTimeout(() => setOpenIndex(null), 300);
          },
          cta: {
            label: 'Mehr erfahren',
            onPress: () => {
              router.push(`/event/${event.id}` as any);
              setTimeout(() => setOpenIndex(null), 300);
            },
          },
        };
      });

      result.push({
        id: 'events',
        slides: eventSlides,
      });
    }

    for (const c of collections) {
      const slides = collectionSlides[c.id] ?? [];
      result.push({
        id: `collection:${c.id}`,
        header: {
          avatarUrl: c.cover_image_url,
          title: c.title,
          subtitle: c.subtitle ?? undefined,
        },
        slides:
          slides.length > 0
            ? slides.map((s) => ({
                backgroundUrl: s.background_image_url,
                overlayText: s.overlay_text,
                textColor: s.text_color ?? '#FFFFFF',
                imageFit: 'cover' as const,
              }))
            : [
                {
                  backgroundUrl: c.cover_image_url ?? '',
                  imageFit: 'cover' as const,
                },
              ],
      });
    }

    return result;
  }, [events, collections, collectionSlides, router]);

  const handleOpen = useCallback((groupIdx: number) => {
    setOpenIndex(groupIdx);
  }, []);

  const handleClose = useCallback(() => setOpenIndex(null), []);

  // The events group is at index 0 when present.
  const hasEvents = events.length > 0;
  const eventsBubbleEvent = events[0]; // cover image
  const collectionsStartIndex = hasEvents ? 1 : 0;

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Create event card */}
        <Pressable
          onPress={() => router.push('/submit-event' as any)}
          style={[
            styles.card,
            styles.createCard,
            { backgroundColor: colors.background, borderColor: colors.background },
          ]}
        >
          <View
            style={[
              styles.createCardTopHalf,
              { backgroundColor: colors.feedBackground },
            ]}
          />
          <View style={[styles.plusCircle, { backgroundColor: colors.primary }]}>
            <Text style={[styles.plusText, { color: colors.background }]}>+</Text>
          </View>
          <Text style={[styles.createLabel, { color: colors.textPrimary }]}>
            {'Veranstaltung\nerstellen'}
          </Text>
        </Pressable>

        {/* ONE events bubble (all events grouped into a single paged story) */}
        {hasEvents && eventsBubbleEvent ? (
          <Pressable onPress={() => handleOpen(0)} style={styles.card}>
            {eventsBubbleEvent.image_url ? (
              <Image
                source={{ uri: eventsBubbleEvent.image_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <View
                style={[StyleSheet.absoluteFill, styles.cardImageFallback]}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.82)']}
              style={styles.cardGradient}
            >
              <Text style={styles.cardTitle} numberOfLines={2}>
                Veranstaltungen
              </Text>
            </LinearGradient>
          </Pressable>
        ) : null}

        {/* Collection bubbles (rendered after the events bubble) */}
        {collections.map((c, idx) => (
          <Pressable
            key={`collection-${c.id}`}
            onPress={() => handleOpen(collectionsStartIndex + idx)}
            style={styles.card}
          >
            {c.cover_image_url ? (
              <Image
                source={{ uri: c.cover_image_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: colors.primary },
                ]}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              style={styles.cardGradient}
            >
              <Text style={styles.cardTitle} numberOfLines={2}>
                {c.title}
              </Text>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>

      <StoryViewer
        visible={openIndex !== null && groups.length > 0}
        groups={groups}
        initialGroupIndex={openIndex ?? 0}
        onClose={handleClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  card: {
    width: 90,
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
  },
  createCard: {
    borderWidth: 1.5,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  createCardTopHalf: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 70,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
  },
  plusCircle: {
    position: 'absolute',
    top: 50,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  plusText: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    lineHeight: 28,
  },
  createLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 15,
  },
  cardImageFallback: {
    backgroundColor: '#1a2a4a',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    paddingTop: 16,
    justifyContent: 'flex-end',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 13,
  },
});
