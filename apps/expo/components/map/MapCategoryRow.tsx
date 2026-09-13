/**
 * The browse row along the bottom of the map: icon above, label centred
 * beneath. It stands on the bottom fade (MapBottomFade) rather than carrying
 * a pane of its own, so the map reads through it the way the design shows.
 *
 * Tapping a category opens its sheet — this component only reports the tap;
 * the map screen owns the sheet and the layer changes.
 */
import React from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { MAP_CATEGORIES, type MapCategoryKey } from '@/lib/map/categories';

const PAD_TOP = 10;
const PAD_BOTTOM = 8;
const ICON_SIZE = 46;
const GAP = 4;
const LABEL_LINE_HEIGHT = 16;

/** Fixed so the screen can stack the fade and the locate button around it. */
export const MAP_CATEGORY_ROW_HEIGHT =
  PAD_TOP + ICON_SIZE + GAP + LABEL_LINE_HEIGHT + PAD_BOTTOM;

type Props = {
  activeKey: MapCategoryKey | null;
  onSelect: (key: MapCategoryKey) => void;
  /** Absolute offset from the screen bottom. */
  bottom: number;
  opacity?: Animated.Value;
  /** While a sheet is open the chrome is faded out and must not take taps. */
  hidden?: boolean;
};

export default function MapCategoryRow({
  activeKey,
  onSelect,
  bottom,
  opacity,
  hidden = false,
}: Props) {
  const { colors } = useTheme();

  return (
    <Animated.View
      style={[styles.wrap, { bottom }, opacity ? { opacity } : null]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
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
                style={[styles.iconWrap, active && { backgroundColor: colors.primaryLight }]}
              >
                <Text style={styles.icon}>{category.icon}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: active ? colors.primary : colors.textPrimary },
                  active && styles.labelActive,
                ]}
              >
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, zIndex: 2000, height: MAP_CATEGORY_ROW_HEIGHT },
  row: { paddingHorizontal: 12, paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM, gap: 4 },
  item: { width: 72, alignItems: 'center', gap: GAP },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 24 },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: LABEL_LINE_HEIGHT,
    textAlign: 'center',
  },
  labelActive: { fontFamily: fontFamily.semiBold },
});
