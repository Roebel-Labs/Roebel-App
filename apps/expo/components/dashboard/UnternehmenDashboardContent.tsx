import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fetchOrgListings } from '@/lib/supabase-marketplace';
import AnalyticsCard from '@/components/AnalyticsCard';

type ListingStats = {
  totalProducts: number;
  totalServices: number;
  activeProducts: number;
  activeServices: number;
  totalViews: number;
};

export default function UnternehmenDashboardContent() {
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const [stats, setStats] = useState<ListingStats>({
    totalProducts: 0,
    totalServices: 0,
    activeProducts: 0,
    activeServices: 0,
    totalViews: 0,
  });

  const loadStats = useCallback(async () => {
    if (!activeAccount?.id) return;

    try {
      const [products, services] = await Promise.all([
        fetchOrgListings(activeAccount.id, 'product'),
        fetchOrgListings(activeAccount.id, 'service'),
      ]);

      const allListings = [...products, ...services];
      setStats({
        totalProducts: products.length,
        totalServices: services.length,
        activeProducts: products.filter(p => p.status === 'active').length,
        activeServices: services.filter(s => s.status === 'active').length,
        totalViews: allListings.reduce((sum, l) => sum + (l.views_count || 0), 0),
      });
    } catch (error) {
      console.error('Error loading unternehmen stats:', error);
    }
  }, [activeAccount?.id]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Produkte & Services</Text>
      <View style={styles.statsGrid}>
        <AnalyticsCard label="Produkte" value={stats.totalProducts} />
        <AnalyticsCard label="Dienstleistungen" value={stats.totalServices} />
        <AnalyticsCard label="Aktive Angebote" value={stats.activeProducts + stats.activeServices} />
        <AnalyticsCard label="Aufrufe gesamt" value={stats.totalViews} />
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
});
