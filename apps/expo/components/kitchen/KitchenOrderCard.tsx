import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { formatMenuPrice } from '@/lib/utils';
import type { Order } from '@/lib/types/orders';
import { ORDER_STATUS_LABELS, ORDER_STATUS_NEXT } from '@/lib/types/orders';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: '#FEF3C7', text: '#92400E' },
  in_progress: { bg: '#DBEAFE', text: '#1E40AF' },
  done: { bg: '#D1FAE5', text: '#065F46' },
};

type Props = {
  order: Order;
  onStatusChange: (orderId: string, newStatus: string) => void;
};

export default function KitchenOrderCard({ order, onStatusChange }: Props) {
  const { colors } = useTheme();
  const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.new;
  const nextStatus = ORDER_STATUS_NEXT[order.status];
  const timeSince = getTimeSince(order.created_at);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: order.status === 'new' ? 4 : 0, borderLeftColor: '#F59E0B' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
            {order.guest_name || 'Gast'}
          </Text>
          {order.placed_by === 'staff' && (
            <View style={{ backgroundColor: colors.borderSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Personal</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: colors.textTertiary }}>{timeSince}</Text>
      </View>

      {order.items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 3 }}>
          <Text style={{ fontSize: 14, color: colors.textPrimary, fontFamily: 'Inter-Medium', marginRight: 6 }}>{item.quantity}x</Text>
          <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1 }}>{item.name}</Text>
          {item.notes ? <Text style={{ fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' }}>{item.notes}</Text> : null}
        </View>
      ))}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSecondary }}>
        <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{formatMenuPrice(order.total)}</Text>
        {nextStatus ? (
          <Pressable
            onPress={() => onStatusChange(order.id, nextStatus)}
            style={{ backgroundColor: statusColor.bg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
          >
            <Text style={{ color: statusColor.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>
              → {ORDER_STATUS_LABELS[nextStatus]}
            </Text>
          </Pressable>
        ) : (
          <View style={{ backgroundColor: STATUS_COLORS.done.bg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
            <Text style={{ color: STATUS_COLORS.done.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>Fertig</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function getTimeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min`;
  return `vor ${Math.floor(mins / 60)} Std`;
}
