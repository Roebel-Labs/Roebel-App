/**
 * The browse row along the bottom of the map: icon above, label centred
 * beneath, on a frosted pane.
 *
 * Tapping a category opens its sheet — this component only reports the tap;
 * the map screen owns the sheet and the layer changes.
 */
import React from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import GlassSurface from '@/components/GlassSurface';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { MAP_CATEGORIES, type MapCategoryKey } from '@/lib/map/categories';

type Props = {
  activeKey: MapCategoryKey | null;
  onSelect: (key: MapCategoryKey) => void;
  /** Absolute offset from the screen bottom (sits above the tab bar). */
  bottom: number;
  opacity?: Animated.Value;
};

export default function MapCategoryRow({ activeKey, onSelect, bottom, opacity }: Props) {
  const { colors } = useTheme();

  return (
    <Animated.View style={[styles.wrap, { bottom, opacity }]} pointerEvents="box-none">
      <View style={styles.pane}>
        {/* The map screen's single Android blur sampler. Adding a second
            flagged surface is what ate content on 2026-08-29 — if the top
            pills ever need real blur, move the flag, don't duplicate it. */}
        <GlassSurface edge="top" androidExperimentalBlur />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {MAP_CATEGORIES.map((category) => {
            const active = category.key === activeKey;
            return (
              <Pressable
                key={category.key}
                onPress={() => onSelect(category.key)}
                style={styles.item}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={category.label}
              >
                <View
                  style={[
                    styles.iconWrap,
                    active && { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <Text style={styles.icon}>{category.icon}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    { color: active ? colors.primary : colors.textSecondary },
                    active && styles.labelActive,
                  ]}
                >
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, zIndex: 2000 },
  // Transparent + clipped so the glass reads as the pane's own material.
  pane: { overflow: 'hidden', paddingTop: 10, paddingBottom: 8 },
  row: { paddingHorizontal: 12, gap: 4 },
  item: { width: 72, alignItems: 'center', gap: 4 },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 24 },
  label: { fontFamily: fontFamily.medium, fontSize: 12, textAlign: 'center' },
  labelActive: { fontFamily: fontFamily.semiBold },
});
