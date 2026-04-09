import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import type { HelpCollection } from '@/lib/types-help';

type Props = {
  collection: HelpCollection;
  onPress: () => void;
};

export default function HelpCollectionCard({ collection, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      {collection.icon_url ? (
        <Image
          source={{ uri: collection.icon_url }}
          style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.icon, { backgroundColor: colors.primaryLight }]} />
      )}
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {collection.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
