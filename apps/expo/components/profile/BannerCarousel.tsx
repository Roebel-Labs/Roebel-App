import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const DOT = 5;

export type BannerSlide = { key: string; node: React.ReactNode };

/**
 * Profile banners: one shows on its own; two or more become a paged carousel with small dots below.
 */
export default function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  if (slides.length === 0) return null;
  if (slides.length === 1) return <>{slides[0].node}</>;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Room for the cards' soft shadow (a horizontal ScrollView clips its content).
        contentContainerStyle={styles.track}
      >
        {slides.map((s) => (
          <View key={s.key} style={{ width }}>
            {s.node}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots} accessibilityLabel={`Banner ${page + 1} von ${slides.length}`}>
        {slides.map((s, i) => (
          <View key={s.key} style={[styles.dot, { backgroundColor: i === page ? colors.textPrimary : colors.border }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { paddingBottom: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
