// apps/expo/components/help/HelpItemRow.tsx

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import type { HelpItem } from '@/lib/types-help';

type Props = {
  item: HelpItem;
  onPress: () => void;
};

export default function HelpItemRow({ item, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      {item.icon_url ? (
        <Image
          source={{ uri: item.icon_url }}
          style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.icon, { backgroundColor: colors.primaryLight }]} />
      )}
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle && (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    padding: 14,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
});
