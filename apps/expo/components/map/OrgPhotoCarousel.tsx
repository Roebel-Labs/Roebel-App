/**
 * The photo rail in the org sheet.
 *
 * Falls back to the org's cover and avatar when the gallery is empty, so a
 * place that has not uploaded anything yet still reads as a place rather than
 * a hole. Renders nothing at all when there is genuinely no image.
 */
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { AccountPhoto } from '@/lib/types';

type Props = {
  photos: AccountPhoto[];
  /** Shown when the gallery is empty. */
  fallbackUrls?: (string | null | undefined)[];
  /** Pink starburst on the last tile, e.g. "#4 Bäckerei". */
  badge?: { rank: string; label: string } | null;
  onPressPhoto?: (index: number) => void;
};

export default function OrgPhotoCarousel({
  photos,
  fallbackUrls = [],
  badge,
  onPressPhoto,
}: Props) {
  const { colors } = useTheme();

  const urls = useMemo(() => {
    if (photos.length) return photos.map((p) => p.url);
    return fallbackUrls.filter((u): u is string => !!u);
  }, [photos, fallbackUrls]);

  if (!urls.length) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={urls}
        keyExtractor={(url, index) => `${url}-${index}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => onPressPhoto?.(index)}
            disabled={!onPressPhoto}
            accessibilityRole={onPressPhoto ? 'button' : 'image'}
            accessibilityLabel={photos[index]?.caption || `Foto ${index + 1} von ${urls.length}`}
          >
            <Image
              source={{ uri: item }}
              style={[styles.photo, { backgroundColor: colors.surfaceSecondary }]}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        )}
      />

      {badge ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeTop}>BELIEBT</Text>
          <Text style={styles.badgeRank}>{badge.rank}</Text>
          <Text style={styles.badgeLabel}>{badge.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  list: { gap: 8, paddingHorizontal: 16 },
  photo: { width: 168, height: 210, borderRadius: 16 },
  badge: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    backgroundColor: '#FFC7E5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  badgeTop: { fontFamily: fontFamily.bold, fontSize: 11, color: '#111', letterSpacing: 0.5 },
  badgeRank: { fontFamily: fontFamily.heading, fontSize: 26, color: '#111', lineHeight: 30 },
  badgeLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: '#111' },
});
