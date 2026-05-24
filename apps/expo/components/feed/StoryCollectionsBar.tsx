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
import { useTheme } from '@/context/ThemeContext';
import {
  fetchSlidesForCollection,
  type StoryCollection,
  type StorySlide,
} from '@/lib/supabase-story-collections';
import StoryViewer, { type StoryGroup } from './StoryViewer';

type Props = {
  collections: StoryCollection[];
  heading?: string;
  showBorder?: boolean;
};

export default function StoryCollectionsBar({
  collections,
  heading,
  showBorder = false,
}: Props) {
  const { colors } = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [slidesById, setSlidesById] = useState<Record<string, StorySlide[]>>({});

  // Pre-fetch all slides for the listed collections (admin-curated, small list).
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      collections.map((c) =>
        fetchSlidesForCollection(c.id).then((s) => [c.id, s] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      setSlidesById(Object.fromEntries(results));
    });
    return () => {
      cancelled = true;
    };
  }, [collections]);

  const groups = useMemo<StoryGroup[]>(
    () =>
      collections.map((c) => {
        const slides = slidesById[c.id] ?? [];
        return {
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
        };
      }),
    [collections, slidesById],
  );

  const handleClose = useCallback(() => setOpenIndex(null), []);

  if (collections.length === 0) return null;

  return (
    <View
      style={[
        styles.wrapper,
        showBorder && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {heading ? (
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          {heading}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {collections.map((c, idx) => (
          <Pressable
            key={c.id}
            onPress={() => setOpenIndex(idx)}
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
              style={styles.gradient}
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
    paddingTop: 4,
  },
  heading: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
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
  gradient: {
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
