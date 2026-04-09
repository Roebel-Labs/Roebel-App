import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import type { HelpCollection } from '@/lib/types-help';

type Props = {
  collection: HelpCollection;
  onPress: () => void;
};

export default function HelpHeroCard({ collection, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress} style={styles.container}>
      {collection.cover_image_url ? (
        <Image
          source={{ uri: collection.cover_image_url }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.image, { backgroundColor: colors.primary }]} />
      )}
      <View style={styles.overlay}>
        <Text style={styles.title}>{collection.title}</Text>
        {collection.subtitle && (
          <Text style={styles.subtitle}>{collection.subtitle}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
});
