import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

const STADTKASSE_IMG = require('../../assets/illustration/muenzen/stadtkasse-2.png');

type Props = {
  /** Frozen treasury figure in euro (full precision; formatted here). */
  euro: number;
  /** Feed usage: tap navigates to the Stadtkasse/treasury screen. */
  onPress?: () => void;
  /** Composer usage: shows a remove "×" instead of the chevron. */
  onRemove?: () => void;
};

/**
 * A frozen Stadtkasse (civic treasury) snapshot embedded in a post. Mirrors the
 * rewards-screen card: piggy bank · bold euro figure (de-DE) · "Stadtkasse"
 * label · chevron. No date is shown. Used in both the composer preview
 * (with `onRemove`) and the feed/detail (with `onPress`).
 */
export default function StadtkasseSnapshotCard({ euro, onPress, onRemove }: Props) {
  const { colors } = useTheme();
  const value =
    typeof euro === 'number' && Number.isFinite(euro)
      ? `${euro.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
      : '–';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.container, { borderColor: colors.border, backgroundColor: colors.background }]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Gemeinschaftskasse ${value}`}
    >
      <Image
        source={STADTKASSE_IMG}
        style={styles.img}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.info}>
        <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
          Gemeinschaftskasse
        </Text>
      </View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          style={[styles.removeBtn, { backgroundColor: colors.error }]}
          accessibilityLabel="Gemeinschaftskasse entfernen"
        >
          <Ionicons name="close" size={14} color="#fff" />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  img: {
    width: 48,
    height: 48,
  },
  info: {
    flex: 1,
  },
  value: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: -2,
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
