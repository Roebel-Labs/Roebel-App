import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import type { HelpCollection } from '@/lib/types-help';

type Props = {
  collection: HelpCollection;
  onPress: () => void;
};

export default function HelpListRow({ collection, onPress }: Props) {
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
      <Text
        style={[styles.title, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {collection.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
