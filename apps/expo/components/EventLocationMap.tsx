import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '@/context/ThemeContext';
import { CalendarIcon } from '@/components/Icons';
import { fontFamily } from '@/constants/theme';

type Props = {
  latitude: number;
  longitude: number;
  /** Short venue label drawn under the pin. */
  label?: string | null;
  eventId: string;
  /** Horizontal space the snippet does not get (screen gutters). */
  horizontalInset?: number;
};

const MAP_HEIGHT = 180;
const PIN_SIZE = 40;

/**
 * Static map snippet centred on the event. The pin is drawn in RN on top of
 * the static image (the image is centred on the coordinates, so the view's
 * centre is the venue). Tapping opens the full map with the event selected.
 */
export default function EventLocationMap({ latitude, longitude, label, eventId, horizontalInset = 32 }: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const mapboxToken =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) return null;

  // Request the image at the box's own ratio so nothing gets cropped off-centre.
  const width = Math.min(1280, Math.round(screenWidth - horizontalInset));
  const style = isDark ? 'dark-v11' : 'light-v11';
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${longitude},${latitude},15,0/${width}x${MAP_HEIGHT}@2x?access_token=${mapboxToken}`;

  return (
    <Pressable
      onPress={() => router.push(`/location?selectedEventId=${eventId}`)}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Ort auf der Karte anzeigen"
    >
      <Image
        source={{ uri: staticMapUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.pinAnchor} pointerEvents="none">
        <View style={[styles.pin, { backgroundColor: colors.primary, borderColor: colors.background }]}>
          <CalendarIcon size={18} color="#ffffff" strokeWidth={1.8} />
        </View>
        {label ? (
          <View style={[styles.labelPill, { backgroundColor: colors.background }]}>
            <Text style={[styles.labelText, { color: colors.textPrimary }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: MAP_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.85,
  },
  // Pin circle centred on the map centre; the label hangs below it.
  pinAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: MAP_HEIGHT / 2 - PIN_SIZE / 2,
    alignItems: 'center',
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelPill: {
    marginTop: 6,
    maxWidth: '70%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  labelText: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
});
