import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon, BookmarkIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { EventRecord } from '@/lib/types';
import EventCard from '@/components/EventCard';
import { EventCardSkeleton } from '@/components/SkeletonLoader';
import { CATEGORY_METADATA, EventCategory } from '@/lib/categories';
import { useTheme } from '@/context/ThemeContext';

export default function CategoryDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();

  const categoryMeta = slug ? CATEGORY_METADATA[slug as EventCategory] : null;

  useEffect(() => {
    if (!slug) return;

    async function fetchEvents() {
      setLoading(true);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayString = today.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'approved')
        .eq('category', slug)
        .gte('date', todayString)
        .order('date', { ascending: true })
        .order('time', { ascending: true, nullsFirst: true });

      if (error) {
        console.error('Error fetching category events:', error);
        setEvents([]);
      } else {
        setEvents(data as EventRecord[]);
      }

      setLoading(false);
    }

    fetchEvents();
  }, [slug]);

  if (!categoryMeta) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.notFoundContainer}>
          <Text style={[styles.notFoundTitle, { color: colors.textPrimary }]}>Kategorie nicht gefunden</Text>
          <Pressable onPress={() => router.back()} style={[styles.notFoundButton, { backgroundColor: colors.tabIconActive }]}>
            <Text style={[styles.notFoundButtonText, { color: colors.textInverted }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.flex1}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image Section */}
        <View
          style={[styles.heroSection, { paddingTop: insets.top + 60, backgroundColor: colors.categoryBackground }]}
        >
          <View style={styles.heroImageContainer}>
            <Image
              source={categoryMeta.image}
              style={{ width: 200, height: 180 }}
              contentFit="contain"
            />
          </View>

          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            style={[styles.heroBackButton, { top: insets.top + 8, backgroundColor: colors.background }, shadows.backButton]}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ArrowLeftIcon size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Content Section */}
        <View style={styles.contentSection}>
          <Text style={[styles.categoryTitle, { color: colors.textPrimary }]}>{categoryMeta.label}</Text>
          <Text style={[styles.categoryDescription, { color: colors.textPrimary }]}>{categoryMeta.description}</Text>

          {/* Events List */}
          <View style={styles.eventsList}>
            {loading ? (
              <>
                {[1, 2, 3].map((index) => (
                  <EventCardSkeleton key={index} />
                ))}
              </>
            ) : events.length === 0 ? (
              <View style={styles.emptyEventsContainer}>
                <Text style={[styles.emptyEventsText, { color: colors.textSecondary }]}>
                  Keine Veranstaltungen in dieser Kategorie gefunden.
                </Text>
              </View>
            ) : (
              events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const shadows = StyleSheet.create({
  backButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notFoundTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
  },
  notFoundButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  notFoundButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  heroSection: {
    position: 'relative',
    paddingBottom: 20,
  },
  heroImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
  },
  heroBackButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentSection: {
    paddingTop: 24,
  },
  categoryTitle: {
    paddingHorizontal: 16,
    fontSize: 26,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  categoryDescription: {
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    opacity: 0.7,
    lineHeight: 24,
    marginBottom: 24,
  },
  eventsList: {
    marginTop: 8,
  },
  emptyEventsContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyEventsText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
});
