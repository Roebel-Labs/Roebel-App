import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

type Props = {
  imageUrls: string[];
  onPress?: (index: number) => void;
  /** Optional overlay rendered absolutely on top of each cell (e.g., remove buttons). */
  renderOverlay?: (index: number) => React.ReactNode;
};

export default function PostImageGrid({ imageUrls, onPress, renderOverlay }: Props) {
  if (imageUrls.length === 0) return null;

  const handlePress = (index: number) => {
    onPress?.(index);
  };

  if (imageUrls.length === 1) {
    return (
      <View style={styles.singleContainer}>
        <Pressable onPress={() => handlePress(0)} style={styles.fill}>
          <Image
            source={{ uri: imageUrls[0] }}
            style={styles.singleImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
        {renderOverlay?.(0)}
      </View>
    );
  }

  if (imageUrls.length === 2) {
    return (
      <View style={styles.doubleContainer}>
        {imageUrls.map((url, i) => (
          <View key={i} style={styles.doubleItem}>
            <Pressable onPress={() => handlePress(i)} style={styles.fill}>
              <Image
                source={{ uri: url }}
                style={styles.doubleImage}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            </Pressable>
            {renderOverlay?.(i)}
          </View>
        ))}
      </View>
    );
  }

  // 3 or 4 images: 2x2 grid
  return (
    <View style={styles.gridContainer}>
      <View style={styles.gridRow}>
        <View style={styles.gridItem}>
          <Pressable onPress={() => handlePress(0)} style={styles.fill}>
            <Image
              source={{ uri: imageUrls[0] }}
              style={styles.gridImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
          {renderOverlay?.(0)}
        </View>
        <View style={styles.gridItem}>
          <Pressable onPress={() => handlePress(1)} style={styles.fill}>
            <Image
              source={{ uri: imageUrls[1] }}
              style={styles.gridImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
          {renderOverlay?.(1)}
        </View>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.gridItem}>
          <Pressable onPress={() => handlePress(2)} style={styles.fill}>
            <Image
              source={{ uri: imageUrls[2] }}
              style={styles.gridImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
          {renderOverlay?.(2)}
        </View>
        {imageUrls.length >= 4 && (
          <View style={styles.gridItem}>
            <Pressable onPress={() => handlePress(3)} style={styles.fill}>
              <Image
                source={{ uri: imageUrls[3] }}
                style={styles.gridImage}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            </Pressable>
            {renderOverlay?.(3)}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  singleContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  singleImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  doubleContainer: {
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  doubleItem: {
    flex: 1,
    position: 'relative',
  },
  doubleImage: {
    width: '100%',
    height: 180,
  },
  gridContainer: {
    gap: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 4,
  },
  gridItem: {
    flex: 1,
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: 130,
  },
});
