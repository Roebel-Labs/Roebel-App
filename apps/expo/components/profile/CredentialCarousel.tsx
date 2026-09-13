import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { CredentialKind } from '@/lib/credentials';
import CredentialCard from './CredentialCard';

const GAP = 12;
/** How much of the next card is teased at the right edge. */
const TEASE = 28;

type Props = {
  /** Front-first: the card the user tapped comes first. */
  kinds: CredentialKind[];
  initialKind?: CredentialKind;
  onActiveChange: (kind: CredentialKind) => void;
};

/**
 * Full-size cards in a horizontally snapping row. With one card it is a
 * plain full-width card; with more, the next card peeks in from the right.
 */
export default function CredentialCarousel({ kinds, initialKind, onActiveChange }: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const multi = kinds.length > 1;
  const cardWidth = multi ? screenWidth - 32 - TEASE : screenWidth - 32;
  const interval = cardWidth + GAP;
  const initialIndex = Math.max(0, kinds.indexOf(initialKind ?? kinds[0]));
  const [active, setActive] = useState(initialIndex);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 55 }), []);
  // FlatList forbids swapping onViewableItemsChanged, so the handler is created
  // once and reads the latest kinds/callback through refs updated in effects.
  const kindsRef = useRef(kinds);
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    kindsRef.current = kinds;
  }, [kinds]);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);
  const [onViewableItemsChanged] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const first = viewableItems.find((v) => v.isViewable);
        if (first && typeof first.index === 'number') {
          setActive(first.index);
          onActiveChangeRef.current(kindsRef.current[first.index]);
        }
      },
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CredentialKind; index: number }) => (
      <CredentialCard kind={item} width={cardWidth} style={{ marginRight: index === kinds.length - 1 ? 0 : GAP }} />
    ),
    [cardWidth, kinds.length],
  );

  if (!multi) {
    return (
      <View style={styles.single}>
        <CredentialCard kind={kinds[0]} width={cardWidth} />
      </View>
    );
  }

  return (
    <View>
      <FlatList
        horizontal
        data={kinds}
        keyExtractor={(k) => k}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: interval, offset: interval * index, index })}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        style={styles.overflow}
      />
      <View style={styles.dots} accessibilityRole="none">
        {kinds.map((k, i) => (
          <View key={k} style={[styles.dot, { backgroundColor: i === active ? colors.primary : colors.border }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  single: { paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 8 },
  overflow: { overflow: 'visible' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
