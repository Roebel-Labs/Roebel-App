import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MenuCategoryRecord, MenuItemRecord, SpecialMenuCategoryRecord, SpecialMenuItemRecord } from '@/lib/types';
import MenuItemCard from './MenuItemCard';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  category: MenuCategoryRecord | SpecialMenuCategoryRecord;
  items: (MenuItemRecord | SpecialMenuItemRecord)[];
};

export default function MenuCategorySection({ category, items }: Props) {
  const { colors } = useTheme();

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{category.name}</Text>
      <View>
        {items.map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  title: { fontSize: 16, fontFamily: 'MonaSansSemiCondensed-Medium', marginBottom: 8 },
});
