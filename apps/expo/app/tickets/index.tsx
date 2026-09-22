// Meine Tickets — Bestellungsübersicht. Zwei Abschnitte: bezahlte Tickets
// für bevorstehende Termine ("Demnächst") und alles andere (vergangene
// Termine, offene/abgelaufene/stornierte/erstattete Bestellungen). Lädt bei
// jedem Fokus neu, damit eine gerade abgeschlossene Zahlung sofort auftaucht.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SectionList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { formatDate, formatTime } from '@/lib/utils';
import { fetchMyTickets, orderStatusLabel, type OrderView } from '@/lib/tickets';

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  paid: { bg: '#DCFCE7', text: '#166534' },
  expired: { bg: '#F3F4F6', text: '#6B7280' },
  cancelled: { bg: '#F3F4F6', text: '#6B7280' },
  refunded: { bg: '#FEE2E2', text: '#991B1B' },
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MyTicketsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();

  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!account) {
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    const res = await fetchMyTickets(account);
    if (res.ok) setOrders(res.data.orders);
    setLoading(false);
  }, [account]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const today = todayISO();
  const upcoming = orders.filter((o) => o.status === 'paid' && !!o.event.date && o.event.date >= today);
  const upcomingIds = new Set(upcoming.map((o) => o.id));
  const other = orders.filter((o) => !upcomingIds.has(o.id));

  const sections = [
    ...(upcoming.length > 0 ? [{ title: 'Demnächst', data: upcoming }] : []),
    ...(other.length > 0 ? [{ title: 'Vergangen / Sonstige', data: other }] : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButtonCircle, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          Meine Tickets
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {!account ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Bitte melde dich an, um deine Tickets zu sehen.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Noch keine Tickets. Veranstaltungen findest du unter Events.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionHeader, { color: colors.textSecondary, backgroundColor: colors.background }]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => <OrderRow order={item} onPress={() => router.push({ pathname: '/tickets/[order]' as any, params: { order: item.id } })} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function OrderRow({ order, onPress }: { order: OrderView; onPress: () => void }) {
  const { colors } = useTheme();
  const startTime = formatTime(order.event.time);
  const whenLine = order.event.date
    ? formatDate(order.event.date) + (startTime ? ` • ${startTime} Uhr` : '')
    : '—';
  const statusColors = STATUS_COLOR[order.status] ?? { bg: colors.surfaceSecondary, text: colors.textSecondary };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Bestellung für ${order.event.title} öffnen`}
    >
      <View style={[styles.thumb, { backgroundColor: colors.cardPlaceholder }]}>
        {order.event.image_url && (
          <Image source={{ uri: order.event.image_url }} style={styles.thumbImage} contentFit="cover" accessibilityIgnoresInvertColors />
        )}
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {order.event.title}
        </Text>
        <Text style={[styles.rowWhen, { color: colors.textSecondary }]} numberOfLines={1}>
          {whenLine}
        </Text>
        <Text style={[styles.rowTickets, { color: colors.textSecondary }]} numberOfLines={1}>
          {order.ticket_type_name} × {order.quantity}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
        <Text style={[styles.statusPillText, { color: statusColors.text }]}>{orderStatusLabel(order.status)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginHorizontal: 8,
  },
  headerSpacer: { width: 40 },
  emptyText: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 40, gap: 10 },
  sectionHeader: { fontSize: 13, fontFamily: 'Inter-SemiBold', marginTop: 12, marginBottom: 8 },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  rowWhen: { fontSize: 12, fontFamily: 'Inter-Regular' },
  rowTickets: { fontSize: 12, fontFamily: 'Inter-Regular' },
  statusPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 11, fontFamily: 'Inter-Medium' },
});
