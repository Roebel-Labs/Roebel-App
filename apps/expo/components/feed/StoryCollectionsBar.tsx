import React, { useCallback, useEffect, useState } from 'react';
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
import StoryViewer, { type StorySlideInput } from './StoryViewer';

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
  const [openId, setOpenId] = useState<string | null>(null);
  const [slidesById, setSlidesById] = useState<Record<string, StorySlide[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleOpen = useCallback(
    async (collection: StoryCollection) => {
      const cached = slidesById[collection.id];
      if (cached) {
        setOpenId(collection.id);
        return;
      }
      setLoadingId(collection.id);
      const slides = await fetchSlidesForCollection(collection.id);
      setSlidesById((m) => ({ ...m, [collection.id]: slides }));
      setLoadingId(null);
      setOpenId(collection.id);
    },
    [slidesById],
  );

  const handleClose = useCallback(() => setOpenId(null), []);

  if (collections.length === 0) return null;

  const activeCollection = openId
    ? collections.find((c) => c.id === openId) ?? null
    : null;
  const activeSlides = openId ? slidesById[openId] ?? [] : [];

  const viewerSlides: StorySlideInput[] = activeSlides.map((s) => ({
    backgroundUrl: s.background_image_url,
    overlayText: s.overlay_text,
    textColor: s.text_color ?? '#FFFFFF',
    imageFit: 'cover',
    header: activeCollection
      ? {
          avatarUrl: activeCollection.cover_image_url,
          title: activeCollection.title,
          subtitle: activeCollection.subtitle ?? undefined,
        }
      : undefined,
  }));

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
        {collections.map((c) => {
          const busy = loadingId === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => handleOpen(c)}
              style={styles.card}
              disabled={busy}
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
          );
        })}
      </ScrollView>

      <StoryViewer
        visible={openId !== null && activeSlides.length > 0}
        slides={viewerSlides}
        initialIndex={0}
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
