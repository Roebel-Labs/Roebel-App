import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useOrderSession } from '@/context/OrderSessionContext';
import { formatMenuPrice } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/lib/types/orders';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: '#FEF3C7', text: '#92400E' },
  in_progress: { bg: '#DBEAFE', text: '#1E40AF' },
  done: { bg: '#D1FAE5', text: '#065F46' },
};

export default function OrderStatusScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { orders, restaurant, session, leaveSession } = useOrderSession();

  const handleBack = () => {
    router.back();
  };

  const handleLeave = () => {
    leaveSession();
    router.replace('/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 20, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Deine Bestellungen</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 2 }}>
          {restaurant?.name} — Tisch {session?.table_number}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {orders.length === 0 ? (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>Noch keine Bestellungen</Text>
        ) : (
          orders.map((order) => {
            const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.new;
            return (
              <View key={order.id} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ backgroundColor: statusColor.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: statusColor.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textTertiary }}>
                    {new Date(order.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {order.items.map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>{item.quantity}x {item.name}</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary }}>{formatMenuPrice(item.price * item.quantity)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSecondary }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Summe</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{formatMenuPrice(order.total)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={{ padding: 16, gap: 10 }}>
        <Pressable onPress={handleBack} style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>Weitere Bestellung aufgeben</Text>
        </Pressable>
        <Pressable onPress={handleLeave} style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 15, fontFamily: 'Inter-Regular' }}>Sitzung verlassen</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
