import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { CATEGORY_METADATA, EventCategory } from '@/lib/categories';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  category: EventCategory;
  onPress: () => void;
};

export default function CategoryCard({ category, onPress }: Props) {
  const metadata = CATEGORY_METADATA[category];
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { borderColor: colors.borderSecondary, backgroundColor: colors.background }]}
      accessibilityRole="button"
      accessibilityLabel={`Kategorie ${metadata.label}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.categoryBackground }]}>
        <Image
          source={metadata.image}
          style={styles.icon}
          contentFit="contain"
        />
      </View>
      <Text style={[styles.label, { color: colors.textPrimary }]}>{metadata.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 24,
    height: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
