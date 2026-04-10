import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import type { HelpCollection } from '@/lib/types-help';

type Props = {
  collection: HelpCollection;
  onPress: () => void;
  size?: 'large' | 'small';
};

export default function HelpHeroCard({ collection, onPress, size = 'large' }: Props) {
  const { colors } = useTheme();
  const isLarge = size === 'large';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      {collection.cover_image_url ? (
        <Image
          source={{ uri: collection.cover_image_url }}
          style={[isLarge ? styles.imageLarge : styles.imageSmall]}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            isLarge ? styles.imageLarge : styles.imageSmall,
            { backgroundColor: colors.primaryLight },
          ]}
        />
      )}
      <View style={styles.textContainer}>
        <Text
          style={[
            isLarge ? styles.titleLarge : styles.titleSmall,
            { color: colors.textPrimary },
          ]}
          numberOfLines={2}
        >
          {collection.title}
        </Text>
        {collection.subtitle && (
          <Text
            style={[styles.subtitle, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {collection.subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    flex: 1,
  },
  imageLarge: {
    width: '100%',
    height: 180,
  },
  imageSmall: {
    width: '100%',
    height: 110,
  },
  textContainer: {
    padding: 14,
  },
  titleLarge: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  titleSmall: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
});
