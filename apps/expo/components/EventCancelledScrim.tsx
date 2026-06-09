import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  /** Border radius to match the underlying image container. */
  radius?: number;
  /** Smaller label for compact carousel/thumbnail cards. */
  compact?: boolean;
};

/**
 * A dark scrim with a red "Abgesagt" banner, sized to cover an event image.
 * Place as the last child of a `position: relative` image container so it
 * overlays the picture. Colors are intentionally theme-independent — the
 * scrim darkens the image in both light and dark mode.
 */
export default function EventCancelledScrim({ radius = 0, compact = false }: Props) {
  return (
    <View style={[styles.scrim, { borderRadius: radius }]} pointerEvents="none">
      <View style={[styles.banner, compact && styles.bannerCompact]}>
        <Text style={[styles.text, compact && styles.textCompact]}>Abgesagt</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  text: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  textCompact: {
    fontSize: 12,
  },
});
