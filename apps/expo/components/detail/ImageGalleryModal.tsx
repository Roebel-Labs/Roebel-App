/**
 * Full-screen photo gallery opened from a detail hero: plain page background,
 * "1 von N" centered at the top, a close X top-right, and horizontally paged
 * photos with 24px rounded corners where the neighbours peek in at the edges.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

/** Horizontal gutter around the active photo; the neighbours show inside it. */
const SIDE = 28;
const GAP = 10;
const RADIUS = 24;

type Props = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
};

export default function ImageGalleryModal({ visible, images, initialIndex = 0, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<string>>(null);

  const itemWidth = width - SIDE * 2;
  const interval = itemWidth + GAP;
  // Portrait-ish card, but never taller than the space under the top bar.
  const itemHeight = Math.min(Math.round(itemWidth * 1.3), height - insets.top - insets.bottom - 56 - 48);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / interval);
      setIndex(Math.max(0, Math.min(images.length - 1, next)));
    },
    [interval, images.length],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Text style={[styles.counter, { color: colors.textPrimary }]}>
            {Math.min(index + 1, images.length)} von {images.length}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.close, { backgroundColor: isDark ? colors.surface : 'transparent' }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Galerie schließen"
          >
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={images}
          horizontal
          keyExtractor={(uri, i) => `${i}-${uri}`}
          showsHorizontalScrollIndicator={false}
          snapToInterval={interval}
          decelerationRate="fast"
          disableIntervalMomentum
          initialScrollIndex={Math.min(initialIndex, Math.max(0, images.length - 1))}
          getItemLayout={(_, i) => ({ length: interval, offset: interval * i, index: i })}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: SIDE }]}
          ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
          onMomentumScrollEnd={onMomentumEnd}
          style={styles.list}
          renderItem={({ item, index: i }) => (
            <View style={[styles.card, { width: itemWidth, height: itemHeight, backgroundColor: colors.surface }]}>
              <Image
                source={{ uri: item }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                accessibilityLabel={`Foto ${i + 1} von ${images.length}`}
              />
            </View>
          )}
        />
        <View style={{ height: insets.bottom + 24 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 20,
  },
  close: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  list: { flexGrow: 0, flex: 1 },
  listContent: { alignItems: 'center' },
  card: {
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
});
