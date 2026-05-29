import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import type { FeedType } from '@/lib/types/feed';

type Props = {
  activeTab: FeedType;
  onTabChange: (tab: FeedType) => void;
  scrollProgress?: SharedValue<number>;
  /** Per-tab "new content" flag — renders a primary dot on inactive tabs. */
  unread?: Partial<Record<FeedType, boolean>>;
};

const TABS: { key: FeedType; label: string }[] = [
  { key: 'main', label: 'Für Alle' },
  { key: 'rathaus', label: 'Stadt' },
  { key: 'app', label: 'App' },
];

type Layout = { x: number; width: number };

export default function FeedTabBar({ activeTab, onTabChange, scrollProgress, unread }: Props) {
  const { colors } = useTheme();
  const [layouts, setLayouts] = useState<Record<number, Layout>>({});

  const handleLayout = (index: number) => (e: { nativeEvent: { layout: Layout } }) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const current = prev[index];
      if (current && current.x === x && current.width === width) return prev;
      return { ...prev, [index]: { x, width } };
    });
  };

  const allMeasured = Object.keys(layouts).length === TABS.length;

  const underlineStyle = useAnimatedStyle(() => {
    if (!scrollProgress || !allMeasured) {
      return { opacity: 0 };
    }
    const input = TABS.map((_, i) => i);
    const xOutput = TABS.map((_, i) => layouts[i]?.x ?? 0);
    const wOutput = TABS.map((_, i) => layouts[i]?.width ?? 0);
    return {
      opacity: 1,
      transform: [{ translateX: interpolate(scrollProgress.value, input, xOutput) }],
      width: interpolate(scrollProgress.value, input, wOutput),
    };
  });

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {TABS.map((tab, i) => {
        const isActive = tab.key === activeTab;
        const showDot = !isActive && !!unread?.[tab.key];
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            onLayout={handleLayout(i)}
            style={styles.tab}
          >
            <View style={styles.labelWrap}>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.primary : colors.textTertiary,
                    fontFamily: isActive ? 'Inter-Medium' : 'Inter-Regular',
                  },
                ]}
              >
                {tab.label}
              </Text>
              {showDot && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
            </View>
          </Pressable>
        );
      })}
      <Animated.View
        pointerEvents="none"
        style={[styles.underline, { backgroundColor: colors.primary }, underlineStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  labelWrap: {
    position: 'relative',
  },
  tabLabel: {
    fontSize: 15,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -9,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  underline: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
});
