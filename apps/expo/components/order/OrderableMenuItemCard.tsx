import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import type { MenuItemRecord } from '@/lib/types';
import { formatMenuPrice } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  item: MenuItemRecord;
  onAdd: (item: MenuItemRecord, quantity: number, notes?: string) => void;
};

export default function OrderableMenuItemCard({ item, onAdd }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const handleAdd = () => {
    onAdd(item, quantity, notes.trim() || undefined);
    setExpanded(false);
    setQuantity(1);
    setNotes('');
  };

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSecondary, paddingVertical: 14, paddingHorizontal: 16 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}>{item.name}</Text>
          {item.description ? (
            <Text style={{ fontSize: 13, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
            {formatMenuPrice(item.price)}
          </Text>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.onPrimary, fontSize: 18, fontFamily: 'Inter-Medium' }}>+</Text>
          </View>
        </View>
      </View>

      {expanded && (
        <View style={{ marginTop: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 18, color: colors.textPrimary }}>-</Text>
            </Pressable>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary, minWidth: 24, textAlign: 'center' }}>
              {quantity}
            </Text>
            <Pressable
              onPress={() => setQuantity(quantity + 1)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 18, color: colors.textPrimary }}>+</Text>
            </Pressable>
          </View>
          <TextInput
            placeholder="Anmerkung (z.B. ohne Zwiebeln)"
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter-Regular', color: colors.textPrimary }}
          />
          <Pressable
            onPress={handleAdd}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>
              Hinzufügen ({formatMenuPrice(item.price * quantity)})
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}
