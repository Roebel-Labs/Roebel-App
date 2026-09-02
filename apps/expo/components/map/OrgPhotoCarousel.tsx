/**
 * The photo rail in the org sheet.
 *
 * A paged gallery rather than a free-scrolling rail: photos snap so a swipe
 * always lands on a picture instead of drifting to rest between two. Owners
 * get a "+" tile at the end to add a photo without leaving the map.
 *
 * Falls back to the org's cover and avatar when the gallery is empty, so a
 * place that has not uploaded anything yet still reads as a place rather than
 * a hole. Renders nothing at all when there is genuinely no image.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { AccountPhoto } from '@/lib/types';

const GUTTER = 16;
const GAP = 8;
// Leave the next photo peeking so the rail reads as swipeable at a glance.
const PEEK = 44;
const TILE_WIDTH = Dimensions.get('window').width - GUTTER * 2 - PEEK;
const TILE_HEIGHT = Math.round(TILE_WIDTH * 0.78);
const SNAP = TILE_WIDTH + GAP;

type Props = {
  photos: AccountPhoto[];
  /** Shown when the gallery is empty. */
  fallbackUrls?: (string | null | undefined)[];
  /** Pink starburst on the last tile, e.g. "#4 Bäckerei". */
  badge?: { rank: string; label: string } | null;
  onPressPhoto?: (index: number) => void;
  /** Owners get the "+" tile. */
  canUpload?: boolean;
  uploading?: boolean;
  onAddPhoto?: () => void;
};

export default function OrgPhotoCarousel({
  photos,
  fallbackUrls = [],
  badge,
  onPressPhoto,
  canUpload = false,
  uploading = false,
  onAddPhoto,
}: Props) {
  const { colors } = useTheme();
  const [page, setPage] = useState(0);

  const urls = useMemo(() => {
    if (photos.length) return photos.map((p) => p.url);
    return fallbackUrls.filter((u): u is string => !!u);
  }, [photos, fallbackUrls]);

  // getItemLayout keeps paging maths independent of measurement, so the first
  // swipe snaps correctly even before the row has laid out.
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: SNAP, offset: SNAP * index, index }),
    []
  );

  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / SNAP));
  }, []);

  if (!urls.length && !canUpload) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={urls}
        keyExtractor={(url, index) => `${url}-${index}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={SNAP}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        getItemLayout={getItemLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListFooterComponent={
          canUpload ? (
            <Pressable
              onPress={onAddPhoto}
              disabled={uploading}
              style={[
                styles.addTile,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Foto hinzufügen"
            >
              {uploading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Text style={[styles.addPlus, { color: colors.primary }]}>+</Text>
                  <Text style={[styles.addLabel, { color: colors.textSecondary }]}>Foto</Text>
                </>
              )}
            </Pressable>
          ) : null
        }
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

      {urls.length > 1 ? (
        <View style={styles.dots}>
          {urls.map((url, index) => (
            <View
              key={`dot-${url}-${index}`}
              style={[
                styles.dot,
                {
                  backgroundColor: index === page ? colors.textPrimary : colors.border,
                  width: index === page ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      ) : null}

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
  list: { gap: GAP, paddingHorizontal: GUTTER },
  photo: { width: TILE_WIDTH, height: TILE_HEIGHT, borderRadius: 16 },
  addTile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPlus: { fontSize: 34, lineHeight: 38 },
  addLabel: { fontFamily: fontFamily.medium, fontSize: 13 },
  dots: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
  dot: { height: 6, borderRadius: 3 },
  badge: {
    position: 'absolute',
    right: GUTTER + 12,
    bottom: 34,
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
