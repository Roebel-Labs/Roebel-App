import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import { fetchDealsByBusiness, fetchDealAnalytics } from '@/lib/supabase-deals';
import type { BusinessDealRecord, DealAnalytics } from '@/lib/types';
import AnalyticsCard from '@/components/AnalyticsCard';
import DealCard from '@/components/DealCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrgAdsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const { user } = useUser();
  const [deals, setDeals] = useState<BusinessDealRecord[]>([]);
  const [analytics, setAnalytics] = useState<DealAnalytics | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.wallet_address) return;

    try {
      const businesses = await fetchBusinessesByOwner(user.wallet_address);
      const primary = businesses.find(b => b.status === 'approved') || businesses[0];
      if (primary) {
        const [dealsData, analyticsData] = await Promise.all([
          fetchDealsByBusiness(primary.id),
          fetchDealAnalytics(primary.id),
        ]);
        setDeals(dealsData);
        setAnalytics(analyticsData);
      }
    } catch (error) {
      console.error('Error loading ads data:', error);
    }
  }, [user?.wallet_address]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Anzeigen</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Stats */}
        {analytics && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Reichweite</Text>
            <View style={styles.statsGrid}>
              <AnalyticsCard label="Aufrufe" value={analytics.totalViews} />
              <AnalyticsCard label="Klicks" value={analytics.totalClicks} />
              <AnalyticsCard label="Aktive Anzeigen" value={analytics.activeDeals} />
              <AnalyticsCard label="Hervorgehoben" value={analytics.boostedDeals} />
            </View>
          </View>
        )}

        {/* Deals / Ads */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Angebote & Werbung</Text>
            <Pressable
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/business/deals/create' as any)}
            >
              <Text style={[styles.addButtonText, { color: colors.onPrimary }]}>+ Neue Anzeige</Text>
            </Pressable>
          </View>

          {deals.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Noch keine Anzeigen erstellt. Erstelle deine erste Anzeige, um Reichweite in Röbel zu gewinnen.
              </Text>
            </View>
          ) : (
            <View style={styles.dealsList}>
              {deals.map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onPress={() => router.push(`/business/deals/${deal.id}` as any)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: { width: 40 },
  content: { flex: 1 },
  section: {
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
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
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  dealsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  emptyState: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  bottomPadding: { height: 40 },
});
