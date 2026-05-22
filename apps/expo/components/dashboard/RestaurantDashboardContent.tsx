import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { supabase } from '@/lib/supabase';
import AnalyticsCard from '@/components/AnalyticsCard';

type SessionStats = {
  totalSessions: number;
  openedByStaff: number;
  openedByCitizens: number;
  openedByGuests: number;
  totalOrders: number;
  avgOrdersPerSession: number;
};

export default function RestaurantDashboardContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const canEditMenu = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';
  const [stats, setStats] = useState<SessionStats>({
    totalSessions: 0,
    openedByStaff: 0,
    openedByCitizens: 0,
    openedByGuests: 0,
    totalOrders: 0,
    avgOrdersPerSession: 0,
  });
  const [menuCounts, setMenuCounts] = useState<{ categories: number; items: number }>({ categories: 0, items: 0 });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!activeAccount?.id) return;

    try {
      // Fetch restaurant linked to this account
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('account_id', activeAccount.id)
        .single();

      if (!restaurant) return;

      // Menu category + item counts for the Speisekarte tile.
      const [{ count: catCount }, { count: itemCount }] = await Promise.all([
        supabase.from('menu_categories').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id),
        supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id),
      ]);
      setMenuCounts({ categories: catCount ?? 0, items: itemCount ?? 0 });

      // Fetch table sessions
      const { data: sessions } = await supabase
        .from('table_sessions')
        .select('id, opened_by, orders(id)')
        .eq('restaurant_id', restaurant.id);

      if (sessions) {
        const totalOrders = sessions.reduce(
          (sum: number, s: any) => sum + (Array.isArray(s.orders) ? s.orders.length : 0),
          0
        );
        setStats({
          totalSessions: sessions.length,
          openedByStaff: sessions.filter((s: any) => s.opened_by === 'staff').length,
          openedByCitizens: sessions.filter((s: any) => s.opened_by === 'citizen').length,
          openedByGuests: sessions.filter((s: any) => s.opened_by === 'guest' || !s.opened_by).length,
          totalOrders,
          avgOrdersPerSession: sessions.length > 0 ? Math.round(totalOrders / sessions.length * 10) / 10 : 0,
        });
      }
    } catch (error) {
      console.error('Error loading restaurant stats:', error);
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.id]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <View style={styles.container}>
      {canEditMenu && (
        <Pressable
          onPress={() => router.push('/org/menu' as any)}
          style={[styles.menuTile, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.tileTitle, { color: colors.textPrimary }]}>Speisekarte verwalten</Text>
            <Text style={[styles.tileSubtitle, { color: colors.textSecondary }]}>
              {menuCounts.categories} Kategorien · {menuCounts.items} Gerichte · KI-Bilder
            </Text>
          </View>
          <Text style={{ color: colors.primary, fontFamily: 'Inter-Medium', fontSize: 20 }}>›</Text>
        </Pressable>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Tisch-Statistiken</Text>
      <View style={styles.statsGrid}>
        <AnalyticsCard label="Sitzungen gesamt" value={stats.totalSessions} />
        <AnalyticsCard label="Durch Mitarbeiter" value={stats.openedByStaff} />
        <AnalyticsCard label="Durch Bürger" value={stats.openedByCitizens} />
        <AnalyticsCard label="Durch Gäste" value={stats.openedByGuests} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>
        Bestellungen
      </Text>
      <View style={styles.statsGrid}>
        <AnalyticsCard label="Bestellungen gesamt" value={stats.totalOrders} />
        <AnalyticsCard label="Ø pro Sitzung" value={stats.avgOrdersPerSession} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  menuTile: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tileTitle: { fontSize: 15, fontFamily: 'Inter-Medium' },
  tileSubtitle: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
});
