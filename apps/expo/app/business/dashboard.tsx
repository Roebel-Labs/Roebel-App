import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fetchDealsByBusiness, fetchDealAnalytics } from '@/lib/supabase-deals';
import type { BusinessDealRecord, DealAnalytics } from '@/lib/types';
import BusinessStatusBanner from '@/components/BusinessStatusBanner';
import DealCard from '@/components/DealCard';
import AnalyticsCard from '@/components/AnalyticsCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function BusinessDashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { userBusiness } = useUser();

  const [deals, setDeals] = useState<BusinessDealRecord[]>([]);
  const [analytics, setAnalytics] = useState<DealAnalytics | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!userBusiness) return;
    try {
      const [dealsData, analyticsData] = await Promise.all([
        fetchDealsByBusiness(userBusiness.id),
        fetchDealAnalytics(userBusiness.id),
      ]);
      setDeals(dealsData);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [userBusiness?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (!userBusiness) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Kein Unternehmen gefunden</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dashboard</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Business Status */}
        <View style={styles.section}>
          <BusinessStatusBanner business={userBusiness} />
        </View>

        {/* Quick Stats */}
        {analytics && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Übersicht</Text>
            <View style={styles.statsGrid}>
              <AnalyticsCard label="Aufrufe" value={analytics.totalViews} />
              <AnalyticsCard label="Klicks" value={analytics.totalClicks} />
              <AnalyticsCard label="Aktive Angebote" value={analytics.activeDeals} />
              <AnalyticsCard label="Hervorgehoben" value={analytics.boostedDeals} />
            </View>
          </View>
        )}

        {/* Deals Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Angebote</Text>
            {userBusiness.status === 'approved' && (
              <Pressable
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/business/deals/create' as any)}
              >
                <Text style={[styles.addButtonText, { color: colors.onPrimary }]}>+ Neues Angebot</Text>
              </Pressable>
            )}
          </View>

          {deals.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
              <Text style={[styles.emptyStateText, { color: colors.textTertiary }]}>
                {userBusiness.status === 'approved'
                  ? 'Noch keine Angebote erstellt'
                  : 'Angebote können nach Freischaltung erstellt werden'}
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
  container: {
    flex: 1,
  },
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
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
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
    color: '#ffffff',
  },
  dealsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 24,
  },
  emptyState: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  bottomPadding: {
    height: 40,
  },
});
