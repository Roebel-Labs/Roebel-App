import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import {
  fetchKitchenOrders,
  updateOrderStatus,
  closeSession,
  findOrCreateSession,
  subscribeToKitchenOrders,
  fetchRestaurantTables,
} from '@/lib/supabase-orders';
import { supabase } from '@/lib/supabase';
import type { SessionWithOrders, OrderStatus, RestaurantTable } from '@/lib/types/orders';
import KitchenOrderCard from '@/components/kitchen/KitchenOrderCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function KitchenDashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [sessionsWithOrders, setSessionsWithOrders] = useState<SessionWithOrders[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  // Find the restaurant linked to this account
  useEffect(() => {
    if (!activeAccount?.id) return;

    async function findRestaurant() {
      const { data } = await supabase
        .from('restaurants')
        .select('id')
        .eq('account_id', activeAccount!.id)
        .maybeSingle();

      if (data) setRestaurantId(data.id);
      else setLoading(false);
    }
    findRestaurant();
  }, [activeAccount?.id]);

  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [sessions, tbl] = await Promise.all([
        fetchKitchenOrders(restaurantId),
        fetchRestaurantTables(restaurantId),
      ]);
      setSessionsWithOrders(sessions);
      setTables(tbl);
    } catch (error) {
      console.error('Kitchen load error:', error);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!restaurantId) return;

    const channel = subscribeToKitchenOrders(restaurantId, () => {
      loadData();
    });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [restaurantId, loadData]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    await updateOrderStatus(orderId, newStatus as OrderStatus);
    loadData();
  };

  const handleCloseSession = async (sessionId: string) => {
    await closeSession(sessionId);
    setSelectedSession(null);
    loadData();
  };

  const handleCreateSession = async (tableNumber: string) => {
    if (!restaurantId) return;
    await findOrCreateSession(restaurantId, tableNumber);
    loadData();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (!restaurantId && !loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          Kein Restaurant mit diesem Konto verknüpft
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.backBtnText, { color: colors.onPrimary }]}>Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const selected = selectedSession ? sessionsWithOrders.find(s => s.session.id === selectedSession) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => selectedSession ? setSelectedSession(null) : router.back()} style={styles.headerBack}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {selectedSession ? `Tisch ${selected?.session.table_number}` : 'Küche'}
        </Text>
        <Pressable
          onPress={() => router.push('/kitchen/tables')}
          style={[styles.tablesBtn, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.tablesBtnText, { color: colors.textPrimary }]}>Tische</Text>
        </Pressable>
      </View>

      {!selectedSession ? (
        <ScrollView
          style={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {sessionsWithOrders.length === 0 && (
            <Text style={[styles.noSessionsText, { color: colors.textTertiary }]}>Keine aktiven Tische</Text>
          )}
          {sessionsWithOrders.map(({ session, orders }) => {
            const newCount = orders.filter(o => o.status === 'new').length;
            const inProgressCount = orders.filter(o => o.status === 'in_progress').length;

            return (
              <Pressable
                key={session.id}
                onPress={() => setSelectedSession(session.id)}
                style={[
                  styles.sessionCard,
                  { backgroundColor: colors.surface, borderLeftWidth: newCount > 0 ? 4 : 0, borderLeftColor: '#F59E0B' },
                ]}
              >
                <Text style={[styles.sessionTitle, { color: colors.textPrimary }]}>Tisch {session.table_number}</Text>
                <View style={styles.sessionMeta}>
                  {newCount > 0 && <Text style={styles.newCount}>{newCount} neu</Text>}
                  {inProgressCount > 0 && <Text style={styles.inProgressCount}>{inProgressCount} in Bearbeitung</Text>}
                  <Text style={[styles.totalCount, { color: colors.textTertiary }]}>{orders.length} gesamt</Text>
                </View>
              </Pressable>
            );
          })}

          {tables.filter(t => t.is_active && !sessionsWithOrders.some(s => s.session.table_number === t.table_number)).length > 0 && (
            <View style={styles.newSessionSection}>
              <Text style={[styles.newSessionLabel, { color: colors.textSecondary }]}>Neue Sitzung starten</Text>
              <View style={styles.tableButtonRow}>
                {tables
                  .filter(t => t.is_active && !sessionsWithOrders.some(s => s.session.table_number === t.table_number))
                  .map(t => (
                    <Pressable
                      key={t.id}
                      onPress={() => handleCreateSession(t.table_number)}
                      style={[styles.tableButton, { backgroundColor: colors.surface }]}
                    >
                      <Text style={[styles.tableButtonText, { color: colors.textPrimary }]}>+ Tisch {t.table_number}</Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollContent}>
          {selected?.orders.map(order => (
            <KitchenOrderCard key={order.id} order={order} onStatusChange={handleStatusChange} />
          ))}

          <Pressable
            onPress={() => router.push(`/kitchen/order/${selectedSession}` as any)}
            style={[styles.orderBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.orderBtnText, { color: colors.onPrimary }]}>Bestellung aufnehmen</Text>
          </Pressable>

          <Pressable
            onPress={() => handleCloseSession(selectedSession)}
            style={styles.closeSessionBtn}
          >
            <Text style={styles.closeSessionText}>Tisch schließen</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    padding: 32,
  },
  backBtn: {
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtnText: {
    fontFamily: 'Inter-Medium',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerBack: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },
  tablesBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tablesBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  noSessionsText: {
    textAlign: 'center',
    marginTop: 40,
  },
  sessionCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  sessionTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Medium',
  },
  sessionMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  newCount: {
    fontSize: 13,
    color: '#92400E',
  },
  inProgressCount: {
    fontSize: 13,
    color: '#1E40AF',
  },
  totalCount: {
    fontSize: 13,
  },
  newSessionSection: {
    marginTop: 20,
  },
  newSessionLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  tableButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tableButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableButtonText: {
    fontSize: 14,
  },
  orderBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  orderBtnText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  closeSessionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  closeSessionText: {
    color: '#DC2626',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
