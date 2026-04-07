import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { formatMenuPrice } from '@/lib/utils';
import type { MenuItemRecord } from '@/lib/types';
import PlusSignIcon from '@/assets/icons/plus-sign.svg';

type Props = {
  item: MenuItemRecord;
  quantity: number;
  onAdd: (item: MenuItemRecord, quantity: number) => void;
};

export default function OrderMenuItemGrid({ item, quantity, onAdd }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => onAdd(item, 1)}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.name}
        </Text>

        {(item.is_vegetarian || item.is_vegan) && (
          <View style={styles.badges}>
            {item.is_vegetarian && (
              <View style={[styles.badge, styles.badgeVeg]}>
                <Text style={styles.badgeText}>V</Text>
              </View>
            )}
            {item.is_vegan && (
              <View style={[styles.badge, styles.badgeVegan]}>
                <Text style={styles.badgeText}>VG</Text>
              </View>
            )}
          </View>
        )}

        {item.description ? (
          <Text style={[styles.description, { color: colors.textTertiary }]} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}

        <Text style={[styles.price, { color: colors.textSecondary }]}>
          {formatMenuPrice(item.price)}
        </Text>
      </View>

      <View style={styles.footer}>
        {quantity > 0 && (
          <Text style={[styles.quantity, { color: colors.primary }]}>{quantity}</Text>
        )}
        <View style={[styles.addButton, { backgroundColor: '#FFFFFF' }]}>
          <PlusSignIcon width={20} height={20} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    lineHeight: 21,
  },
  badges: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeVeg: {
    backgroundColor: '#16a34a',
  },
  badgeVegan: {
    backgroundColor: '#15803d',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  description: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  price: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  quantity: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  addIcon: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
  },
});
