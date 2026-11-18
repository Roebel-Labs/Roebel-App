/**
 * A badge as a stamp on a card (spec 5.6b visual language): round stamp art inside a card frame,
 * never a "token". Without art a neutral ink stamp is drawn with views. `pending` = the organiser
 * has not issued it yet ("wird eingetragen"); `queued` = scanned offline ("wird gesammelt").
 * StampMoment passes an animated layer component (Animated.View) with styles for the stamp and
 * the ink ring; the card itself loads no animation module, so grids and sheets stay light.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

export type StampState = 'collected' | 'pending' | 'queued';

export type StampCardProps = {
  imageUrl: string | null;
  title: string;
  subtitle: string;
  state: StampState;
  size: 'tile' | 'hero';
};

export const STAMP_CHIPS: Record<Exclude<StampState, 'collected'>, string> = {
  pending: 'wird eingetragen',
  queued: 'wird gesammelt',
};

const SIZES = {
  tile: { stamp: 64, title: 13, subtitle: 11, pad: 10 },
  hero: { stamp: 168, title: 20, subtitle: 14, pad: 20 },
} as const;

export default function StampCard({
  imageUrl,
  title,
  subtitle,
  state,
  size,
  stampStyle,
  inkStyle,
  Layer = View,
}: StampCardProps & { stampStyle?: object; inkStyle?: object; Layer?: React.ComponentType<{ style?: unknown; children?: React.ReactNode }> }) {
  const { colors } = useTheme();
  const s = SIZES[size];
  const faded = state !== 'collected';
  const ring = s.stamp + (size === 'hero' ? 16 : 8);
  const chip = state === 'collected' ? null : STAMP_CHIPS[state];
  return (
    <View
      style={[styles.card, { padding: s.pad, backgroundColor: colors.surface, borderColor: colors.border }]}
      accessible
      accessibilityLabel={[title, subtitle, chip].filter(Boolean).join(', ')}
    >
      <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
        <Layer
          style={[styles.ink, { width: ring, height: ring, borderRadius: ring / 2, borderColor: colors.primary, opacity: faded ? 0.35 : 1 }, inkStyle]}
        />
        <Layer style={[{ width: s.stamp, height: s.stamp, opacity: faded ? 0.55 : 1 }, stampStyle]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={{ width: s.stamp, height: s.stamp, borderRadius: s.stamp / 2 }} resizeMode="cover" />
          ) : (
            <DefaultStamp size={s.stamp} color={colors.primary} />
          )}
        </Layer>
      </View>
      {title ? (
        <Text style={[styles.title, { fontSize: s.title, color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={[styles.subtitle, { fontSize: s.subtitle, color: colors.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {chip ? (
        <View style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>{chip}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A neutral ink stamp: double ring and a centre dot. */
function DefaultStamp({ size, color }: { size: number; color: string }) {
  const inner = size * 0.72;
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.04), borderColor: color }]}>
      <View style={[styles.center, { width: inner, height: inner, borderRadius: inner / 2, borderWidth: Math.max(1, size * 0.02), borderColor: color, borderStyle: 'dashed' }]}>
        <View style={{ width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11, backgroundColor: color }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, alignItems: 'center', gap: 6 },
  ink: { position: 'absolute', borderWidth: 2 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.semiBold, textAlign: 'center', marginTop: 4 },
  subtitle: { fontFamily: fontFamily.regular, textAlign: 'center' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 2 },
  chipText: { fontSize: 11, fontFamily: fontFamily.medium },
});
