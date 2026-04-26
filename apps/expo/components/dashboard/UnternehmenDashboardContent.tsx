import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fetchOrgListings } from '@/lib/supabase-marketplace';
import AnalyticsCard from '@/components/AnalyticsCard';
import { canPublishBlog } from '@/lib/types';

type ListingStats = {
  totalProducts: number;
  totalServices: number;
  activeProducts: number;
  activeServices: number;
  totalViews: number;
};

export default function UnternehmenDashboardContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const canWrite = canPublishBlog(activeAccount);
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

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/org/blog' as any)}
          style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Blog verwalten</Text>
            <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
              Artikel anzeigen und veröffentlichen
            </Text>
          </View>
        </Pressable>
        <Pressable
          disabled={!canWrite}
          onPress={() => router.push('/org/blog/new' as any)}
          style={[
            styles.action,
            {
              backgroundColor: canWrite ? colors.primary : colors.surface,
              borderColor: canWrite ? colors.primary : colors.border,
              opacity: canWrite ? 1 : 0.6,
            },
          ]}
        >
          <Ionicons
            name="add-circle-outline"
            size={20}
            color={canWrite ? colors.onPrimary : colors.textTertiary}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.actionTitle,
                { color: canWrite ? colors.onPrimary : colors.textTertiary },
              ]}
            >
              Neuer Artikel
            </Text>
            <Text
              style={[
                styles.actionSub,
                { color: canWrite ? colors.onPrimary : colors.textTertiary, opacity: 0.85 },
              ]}
            >
              {canWrite ? 'Mit einfachem Editor' : 'Nach Freigabe verfügbar'}
            </Text>
          </View>
        </Pressable>
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
  actions: { paddingHorizontal: 16, marginTop: 16, gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionTitle: { fontSize: 14, fontFamily: 'Inter-Medium' },
  actionSub: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
});
