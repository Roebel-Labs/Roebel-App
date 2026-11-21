/**
 * Photo overview ("Fototour", Airbnb-style): header with back arrow + title,
 * then a grid that repeats one full-width photo followed by two side by side.
 * Tapping a photo opens the shared lightbox at that photo; the lightbox's grid
 * button returns here.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ArrowLeftIcon, ShareIcon } from '@/components/Icons';
import ImageZoomModal from '@/components/ImageZoomModal';

const SIDE = 16;
const GAP = 6;
const RADIUS = 16;

type Props = {
  visible: boolean;
  images: string[];
  /** Header title, e.g. "Fototour". */
  title?: string;
  /** Section heading above the grid. */
  sectionTitle?: string;
  onShare?: () => void;
  onClose: () => void;
};

type Row = { kind: 'full'; index: number } | { kind: 'pair'; indices: number[] };

/** 1 full, 2 side by side, repeat — a lone trailing photo goes full width. */
function buildRows(count: number): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < count) {
    rows.push({ kind: 'full', index: i });
    i += 1;
    if (i >= count) break;
    if (i + 1 < count) {
      rows.push({ kind: 'pair', indices: [i, i + 1] });
      i += 2;
    } else {
      rows.push({ kind: 'full', index: i });
      i += 1;
    }
  }
  return rows;
}

export default function PhotoTourModal({
  visible,
  images,
  title = 'Fototour',
  sectionTitle = 'Alle Fotos',
  onShare,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const rows = useMemo(() => buildRows(images.length), [images.length]);
  const fullWidth = width - SIDE * 2;
  const halfWidth = (fullWidth - GAP) / 2;

  const open = useCallback((i: number) => setLightboxIndex(i), []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ArrowLeftIcon size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {onShare ? (
            <Pressable
              onPress={onShare}
              hitSlop={10}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Teilen"
            >
              <ShareIcon size={22} color={colors.textPrimary} />
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{sectionTitle}</Text>
          {rows.map((row) =>
            row.kind === 'full' ? (
              <Tile
                key={`f-${row.index}`}
                uri={images[row.index]}
                index={row.index}
                width={fullWidth}
                height={Math.round(fullWidth * 0.75)}
                placeholder={colors.surfaceSecondary}
                onPress={open}
              />
            ) : (
              <View key={`p-${row.indices[0]}`} style={styles.pair}>
                {row.indices.map((i) => (
                  <Tile
                    key={i}
                    uri={images[i]}
                    index={i}
                    width={halfWidth}
                    height={Math.round(halfWidth * 0.75)}
                    placeholder={colors.surfaceSecondary}
                    onPress={open}
                  />
                ))}
              </View>
            ),
          )}
        </ScrollView>
      </View>

      <ImageZoomModal
        visible={lightboxIndex !== null}
        images={images}
        initialIndex={lightboxIndex ?? 0}
        title={sectionTitle}
        onShowOverview={() => setLightboxIndex(null)}
        onClose={() => setLightboxIndex(null)}
      />
    </Modal>
  );
}

const Tile = memo(function Tile({
  uri,
  index,
  width,
  height,
  placeholder,
  onPress,
}: {
  uri: string;
  index: number;
  width: number;
  height: number;
  placeholder: string;
  onPress: (index: number) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(index)}
      style={({ pressed }) => [styles.tile, { width, height, backgroundColor: placeholder }, pressed && styles.pressed]}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Foto ${index + 1} ansehen`}
    >
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={150}
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: fontFamily.semiBold, marginLeft: 4 },
  sectionTitle: { fontSize: 28, fontFamily: fontFamily.heading, marginTop: 12, marginBottom: 16 },
  pair: { flexDirection: 'row', gap: GAP },
  tile: { borderRadius: RADIUS, overflow: 'hidden', marginBottom: GAP },
  pressed: { opacity: 0.85 },
});
