import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
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
        .eq('status', 'published')
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
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ fontSize: 16, color: colors.textTertiary, textAlign: 'center', padding: 32 }}>
          Kein Restaurant mit diesem Konto verknüpft
        </Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: colors.onPrimary, fontFamily: 'Inter-Medium' }}>Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const selected = selectedSession ? sessionsWithOrders.find(s => s.session.id === selectedSession) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => selectedSession ? setSelectedSession(null) : router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary, flex: 1 }}>
          {selectedSession ? `Tisch ${selected?.session.table_number}` : 'Küche'}
        </Text>
        <Pressable onPress={() => router.push('/kitchen/tables')} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tische</Text>
        </Pressable>
      </View>

      {!selectedSession ? (
        <ScrollView
          style={{ flex: 1, padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {sessionsWithOrders.length === 0 && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>Keine aktiven Tische</Text>
          )}
          {sessionsWithOrders.map(({ session, orders }) => {
            const newCount = orders.filter(o => o.status === 'new').length;
            const inProgressCount = orders.filter(o => o.status === 'in_progress').length;

            return (
              <Pressable
                key={session.id}
                onPress={() => setSelectedSession(session.id)}
                style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderLeftWidth: newCount > 0 ? 4 : 0, borderLeftColor: '#F59E0B' }}
              >
                <Text style={{ fontSize: 17, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tisch {session.table_number}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  {newCount > 0 && <Text style={{ fontSize: 13, color: '#92400E' }}>{newCount} neu</Text>}
                  {inProgressCount > 0 && <Text style={{ fontSize: 13, color: '#1E40AF' }}>{inProgressCount} in Bearbeitung</Text>}
                  <Text style={{ fontSize: 13, color: colors.textTertiary }}>{orders.length} gesamt</Text>
                </View>
              </Pressable>
            );
          })}

          {tables.filter(t => t.is_active && !sessionsWithOrders.some(s => s.session.table_number === t.table_number)).length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 8 }}>Neue Sitzung starten</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tables
                  .filter(t => t.is_active && !sessionsWithOrders.some(s => s.session.table_number === t.table_number))
                  .map(t => (
                    <Pressable
                      key={t.id}
                      onPress={() => handleCreateSession(t.table_number)}
                      style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
                    >
                      <Text style={{ fontSize: 14, color: colors.textPrimary }}>+ Tisch {t.table_number}</Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {selected?.orders.map(order => (
            <KitchenOrderCard key={order.id} order={order} onStatusChange={handleStatusChange} />
          ))}

          <Pressable
            onPress={() => router.push(`/kitchen/order/${selectedSession}` as any)}
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>Bestellung aufnehmen</Text>
          </Pressable>

          <Pressable
            onPress={() => handleCloseSession(selectedSession)}
            style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: '#DC2626', fontSize: 14, fontFamily: 'Inter-Regular' }}>Tisch schließen</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
