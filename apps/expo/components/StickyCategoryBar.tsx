import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { MenuListIcon } from '@/components/Icons';

type Category = { id: string; name: string };

type Props = {
  categories: Category[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onOpenSheet: () => void;
};

const LABEL_GAP = 20;
const LABEL_PADDING_H = 4;

function StickyCategoryBar({ categories, activeIndex, onSelect, onOpenSheet }: Props) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const labelXs = useRef<number[]>([]);
  const labelWs = useRef<number[]>([]);
  const containerW = useRef(0);

  useEffect(() => {
    const x = labelXs.current[activeIndex];
    const w = labelWs.current[activeIndex];
    if (x == null || w == null || containerW.current === 0) return;
    const target = Math.max(0, x + w / 2 - containerW.current / 2);
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [activeIndex]);

  return (
    <View
      collapsable={false}
      style={[styles.container, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
    >
      <Pressable
        onPress={onOpenSheet}
        unstable_pressDelay={0}
        hitSlop={10}
        accessibilityLabel="Kategorien öffnen"
        style={[styles.iconBtn, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
      >
        <MenuListIcon size={20} color={colors.textPrimary} />
      </Pressable>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onLayout={(e) => { containerW.current = e.nativeEvent.layout.width; }}
      >
        {categories.map((cat, idx) => {
          const active = idx === activeIndex;
          return (
            <Pressable
              key={cat.id}
              onPress={() => onSelect(idx)}
              unstable_pressDelay={0}
              hitSlop={8}
              onLayout={(e) => {
                labelXs.current[idx] = e.nativeEvent.layout.x;
                labelWs.current[idx] = e.nativeEvent.layout.width;
              }}
              style={styles.label}
            >
              <Text
                style={[
                  styles.labelText,
                  { color: active ? colors.textPrimary : colors.textSecondary },
                  active && { fontFamily: 'Inter-Medium' },
                ]}
              >
                {cat.name}
              </Text>
              {active && <View style={[styles.underline, { backgroundColor: colors.primary }]} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default React.memo(StickyCategoryBar);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // Keep this view above the scrolled content below it when sticky;
    // without zIndex/elevation, Android can route taps to the content
    // scrolling beneath the bar.
    zIndex: 10,
    elevation: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 16,
    paddingLeft: 4,
    gap: LABEL_GAP,
  },
  label: {
    paddingHorizontal: LABEL_PADDING_H,
    paddingVertical: 8,
    position: 'relative',
  },
  labelText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  underline: {
    position: 'absolute',
    left: LABEL_PADDING_H,
    right: LABEL_PADDING_H,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
});
