import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

type Props = {
  imageUrls: string[];
  onPress?: (index: number) => void;
};

export default function PostImageGrid({ imageUrls, onPress }: Props) {
  if (imageUrls.length === 0) return null;

  const handlePress = (index: number) => {
    onPress?.(index);
  };

  if (imageUrls.length === 1) {
    return (
      <Pressable onPress={() => handlePress(0)} style={styles.singleContainer}>
        <Image
          source={{ uri: imageUrls[0] }}
          style={styles.singleImage}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    );
  }

  if (imageUrls.length === 2) {
    return (
      <View style={styles.doubleContainer}>
        {imageUrls.map((url, i) => (
          <Pressable key={i} onPress={() => handlePress(i)} style={styles.doubleItem}>
            <Image
              source={{ uri: url }}
              style={styles.doubleImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        ))}
      </View>
    );
  }

  // 3 or 4 images: 2x2 grid
  return (
    <View style={styles.gridContainer}>
      <View style={styles.gridRow}>
        <Pressable onPress={() => handlePress(0)} style={styles.gridItem}>
          <Image
            source={{ uri: imageUrls[0] }}
            style={styles.gridImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
        <Pressable onPress={() => handlePress(1)} style={styles.gridItem}>
          <Image
            source={{ uri: imageUrls[1] }}
            style={styles.gridImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
      </View>
      <View style={styles.gridRow}>
        <Pressable onPress={() => handlePress(2)} style={styles.gridItem}>
          <Image
            source={{ uri: imageUrls[2] }}
            style={styles.gridImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
        {imageUrls.length >= 4 && (
          <Pressable onPress={() => handlePress(3)} style={styles.gridItem}>
            <Image
              source={{ uri: imageUrls[3] }}
              style={styles.gridImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  singleContainer: {
    borderRadius: 12,
    overflow: 'hidden',
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
  },
  gridImage: {
    width: '100%',
    height: 130,
  },
});
