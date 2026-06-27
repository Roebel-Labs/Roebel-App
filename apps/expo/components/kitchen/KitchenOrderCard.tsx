import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderLeftWidth: order.status === 'new' ? 4 : 0, borderLeftColor: '#F59E0B' },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.guestRow}>
          <Text style={[styles.guestName, { color: colors.textPrimary }]}>
            {order.guest_name || 'Gast'}
          </Text>
          {order.placed_by === 'staff' && (
            <View style={[styles.staffBadge, { backgroundColor: colors.borderSecondary }]}>
              <Text style={[styles.staffBadgeText, { color: colors.textSecondary }]}>Personal</Text>
            </View>
          )}
        </View>
        <Text style={[styles.timeText, { color: colors.textTertiary }]}>{timeSince}</Text>
      </View>

      {order.items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <Text style={[styles.itemQty, { color: colors.textPrimary }]}>{item.quantity}x</Text>
          <Text style={[styles.itemName, { color: colors.textPrimary }]}>{item.name}</Text>
          {item.notes ? <Text style={[styles.itemNotes, { color: colors.textTertiary }]}>{item.notes}</Text> : null}
        </View>
      ))}

      <View style={[styles.cardFooter, { borderTopColor: colors.borderSecondary }]}>
        <Text style={[styles.totalText, { color: colors.textPrimary }]}>{formatMenuPrice(order.total)}</Text>
        {nextStatus ? (
          <Pressable
            onPress={() => onStatusChange(order.id, nextStatus)}
            style={[styles.statusBtn, { backgroundColor: statusColor.bg }]}
          >
            <Text style={[styles.statusBtnText, { color: statusColor.text }]}>
              → {ORDER_STATUS_LABELS[nextStatus]}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.statusBtn, { backgroundColor: STATUS_COLORS.done.bg }]}>
            <Text style={[styles.statusBtnText, { color: STATUS_COLORS.done.text }]}>Fertig</Text>
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

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guestName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  staffBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  staffBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
  },
  timeText: {
    fontSize: 12,
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  itemQty: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginRight: 6,
  },
  itemName: {
    fontSize: 14,
    flex: 1,
  },
  itemNotes: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  totalText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  statusBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusBtnText: {
    fontSize: 13,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
