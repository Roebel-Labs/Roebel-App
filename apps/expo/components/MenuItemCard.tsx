import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MenuItemRecord, SpecialMenuItemRecord } from '@/lib/types';
import { formatMenuPrice } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  item: MenuItemRecord | SpecialMenuItemRecord;
  showDietaryBadges?: boolean;
};

export default function MenuItemCard({ item, showDietaryBadges = true }: Props) {
  const { colors } = useTheme();
  const isVegetarian = 'is_vegetarian' in item && item.is_vegetarian;
  const isVegan = 'is_vegan' in item && item.is_vegan;

  return (
    <View style={[styles.container, { borderBottomColor: colors.borderSecondary }]}>
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
          {showDietaryBadges && (isVegetarian || isVegan) && (
            <View style={styles.badges}>
              {isVegan && <Text style={[styles.badge, { color: colors.success, backgroundColor: colors.successBackground }]}>V</Text>}
              {isVegetarian && !isVegan && <Text style={[styles.badge, { color: colors.success, backgroundColor: colors.successBackground }]}>VG</Text>}
            </View>
          )}
        </View>
        {item.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <Text style={[styles.price, { color: colors.textPrimary }]}>{formatMenuPrice(item.price)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 16, borderBottomWidth: 1 },
  content: { flex: 1, marginRight: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  name: { fontSize: 14, fontFamily: 'Inter-Regular', marginRight: 8 },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { fontSize: 10, fontFamily: 'Inter-SemiBold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  description: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 4, lineHeight: 20 },
  price: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
