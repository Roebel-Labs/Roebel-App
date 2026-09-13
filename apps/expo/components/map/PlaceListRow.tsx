/**
 * One place in a category sheet: thumbnail, name, category with status, and
 * the address. Tapping selects the place on the map.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import PressableScale from '@/components/PressableScale';
import { LocationIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import {
  getCategoryLabel,
  getEmoji,
  getImageUrl,
  getSubtitle,
  getTitle,
  type PlaceItem,
} from '@/lib/map/place-item';
import PlaceStatusBadge from './PlaceStatusBadge';

type Props = {
  item: PlaceItem;
  onPress: (item: PlaceItem) => void;
  /** Community count shown at the trailing edge, e.g. "👍 9". */
  trailing?: string | null;
};

export default function PlaceListRow({ item, onPress, trailing }: Props) {
  const { colors } = useTheme();
  const imageUrl = getImageUrl(item);
  const subtitle = getSubtitle(item);

  return (
    <PressableScale
      onPress={() => onPress(item)}
      scaleTo={0.98}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={getTitle(item)}
      style={styles.row}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.image, styles.placeholder, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={styles.placeholderEmoji}>{getEmoji(item)}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {getTitle(item)}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.category, { color: colors.textSecondary }]} numberOfLines={1}>
            {getEmoji(item)} {getCategoryLabel(item)}
          </Text>
          <PlaceStatusBadge item={item} />
        </View>
        {subtitle ? (
          <View style={styles.meta}>
            <LocationIcon width={12} height={12} color={colors.textTertiary} />
            <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        ) : null}
      </View>

      {trailing ? (
        <Text style={[styles.trailing, { color: colors.textSecondary }]}>{trailing}</Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  image: { width: 64, height: 64, borderRadius: 14 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderEmoji: { fontSize: 26 },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontFamily: fontFamily.heading },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  category: { fontSize: 12, fontFamily: fontFamily.medium, flexShrink: 1 },
  subtitle: { fontSize: 12, fontFamily: fontFamily.regular, flex: 1 },
  trailing: { fontSize: 13, fontFamily: fontFamily.semiBold },
});
