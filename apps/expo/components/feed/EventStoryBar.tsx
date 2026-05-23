import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchThisWeekEvents } from '@/lib/supabase-posts';
import type { EventRecord } from '@/lib/types';
import StoryViewer, { type StorySlideInput } from './StoryViewer';

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

export default function EventStoryBar() {
  const { colors } = useTheme();
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  useEffect(() => {
    fetchThisWeekEvents().then((data) => setEvents(data as EventRecord[]));
  }, []);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) ?? null,
    [activeEventId, events],
  );

  // Each event opens its own viewer (one slide = the event poster + meta).
  // No more cross-event paging.
  const viewerSlides: StorySlideInput[] = useMemo(() => {
    if (!activeEvent) return [];
    const orgName = activeEvent.account?.name ?? activeEvent.organizer_name;
    const orgAvatar = (activeEvent.account as any)?.avatar_url ?? null;
    const locationLine = activeEvent.location
      ? `${'\u{1F4CD}'} ${activeEvent.location}`
      : undefined;

    return [
      {
        backgroundUrl: activeEvent.image_url ?? '',
        imageFit: 'contain',
        header: {
          avatarUrl: orgAvatar,
          title: orgName,
          subtitle: formatEventDate(activeEvent.date),
        },
        pillText: formatWeekdayLong(activeEvent.date),
        title: activeEvent.title,
        subtitleLine: locationLine,
        cta: {
          label: 'Mehr erfahren',
          onPress: () => {
            router.push(`/event/${activeEvent.id}` as any);
            setTimeout(() => setActiveEventId(null), 300);
          },
        },
      },
    ];
  }, [activeEvent, router]);

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Create event card — always first */}
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

        {/* Event story cards */}
        {events.map((event) => {
          const orgName = (event.account as any)?.name ?? event.organizer_name;
          const orgAvatar = (event.account as any)?.avatar_url ?? null;

          return (
            <Pressable
              key={event.id}
              onPress={() => setActiveEventId(event.id)}
              style={styles.card}
            >
              {event.image_url ? (
                <Image
                  source={{ uri: event.image_url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.cardImageFallback]} />
              )}

              <View style={styles.storyOrgRow}>
                <View style={styles.storyOrgAvatar}>
                  {orgAvatar ? (
                    <Image
                      source={{ uri: orgAvatar }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.storyOrgLetter}>
                      {orgName.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.82)']}
                style={styles.cardGradient}
              >
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {event.title}
                </Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>

      <StoryViewer
        visible={activeEventId !== null && viewerSlides.length > 0}
        slides={viewerSlides}
        initialIndex={0}
        durationMs={10000}
        onClose={() => setActiveEventId(null)}
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
  storyOrgRow: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  storyOrgAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    backgroundColor: '#194383',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyOrgLetter: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
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
