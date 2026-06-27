import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import { fetchDealsByBusiness, fetchDealAnalytics, toggleDealBoost } from '@/lib/supabase-deals';
import type { BusinessRecord, BusinessDealRecord, DealAnalytics } from '@/lib/types';
import AnalyticsCard from '@/components/AnalyticsCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function BusinessAnalyticsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { user } = useUser();

  const [userBusiness, setUserBusiness] = useState<BusinessRecord | null>(null);
  const [analytics, setAnalytics] = useState<DealAnalytics | null>(null);
  const [deals, setDeals] = useState<BusinessDealRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.wallet_address) return;
    try {
      const businesses = await fetchBusinessesByOwner(user.wallet_address);
      const primary = businesses.find(b => b.status === 'approved') || businesses[0] || null;
      setUserBusiness(primary);
      if (primary) {
        const [analyticsData, dealsData] = await Promise.all([
          fetchDealAnalytics(primary.id),
          fetchDealsByBusiness(primary.id),
        ]);
        setAnalytics(analyticsData);
        setDeals(dealsData.sort((a, b) => b.views_count - a.views_count));
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
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

  const handleEndBoost = async (dealId: string) => {
    try {
      await toggleDealBoost(dealId, false);
      await loadData();
    } catch (error) {
      console.error('Error ending boost:', error);
    }
  };

  const boostedDeals = deals.filter(d => d.is_boosted);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Statistiken</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Overview Stats */}
        {analytics && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Übersicht</Text>
            <View style={styles.statsGrid}>
              <AnalyticsCard label="Aufrufe" value={analytics.totalViews} />
              <AnalyticsCard label="Klicks" value={analytics.totalClicks} />
              <AnalyticsCard label="Aktive Angebote" value={analytics.activeDeals} />
              <AnalyticsCard label="Gesamt" value={analytics.totalDeals} />
            </View>
          </View>
        )}

        {/* Performance Ranking */}
        {deals.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Angebote nach Leistung</Text>
            <View style={[styles.listContainer, { backgroundColor: colors.surface }]}>
              {deals.map((deal, index) => (
                <View
                  key={deal.id}
                  style={[
                    styles.listItem,
                    index < deals.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderSecondary },
                  ]}
                >
                  <View style={styles.listItemLeft}>
                    <Text style={[styles.listRank, { color: colors.textTertiary }]}>{index + 1}</Text>
                    <View style={styles.listItemInfo}>
                      <Text style={[styles.listItemTitle, { color: colors.textPrimary }]} numberOfLines={1}>{deal.title}</Text>
                      <Text style={[styles.listItemStatus, { color: colors.textTertiary }]}>
                        {deal.status === 'active' ? 'Aktiv' : deal.status === 'draft' ? 'Entwurf' : deal.status}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.listItemStats}>
                    <Text style={[styles.listItemStat, { color: colors.textPrimary }]}>{deal.views_count}</Text>
                    <Text style={[styles.listItemStatLabel, { color: colors.textTertiary }]}>Aufrufe</Text>
                  </View>
                  <View style={styles.listItemStats}>
                    <Text style={[styles.listItemStat, { color: colors.textPrimary }]}>{deal.clicks_count}</Text>
                    <Text style={[styles.listItemStatLabel, { color: colors.textTertiary }]}>Klicks</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Boost Management */}
        {boostedDeals.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Hervorhebungen</Text>
            <View style={styles.boostList}>
              {boostedDeals.map(deal => (
                <View key={deal.id} style={[styles.boostCard, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
                  <View style={styles.boostCardInfo}>
                    <Text style={[styles.boostCardTitle, { color: isDark ? '#FCD34D' : '#92400E' }]} numberOfLines={1}>
                      {deal.title}
                    </Text>
                    {deal.boost_expires_at && (
                      <Text style={[styles.boostCardExpiry, { color: isDark ? '#D97706' : '#B45309' }]}>
                        Läuft ab: {new Date(deal.boost_expires_at).toLocaleDateString('de-DE')}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={[styles.endBoostButton, { borderColor: isDark ? '#FCD34D' : '#92400E' }]}
                    onPress={() => handleEndBoost(deal.id)}
                  >
                    <Text style={[styles.endBoostText, { color: isDark ? '#FCD34D' : '#92400E' }]}>Beenden</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

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
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  listContainer: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listRank: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    width: 20,
    textAlign: 'center',
  },
  listItemInfo: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  listItemStatus: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  listItemStats: {
    alignItems: 'center',
    width: 60,
  },
  listItemStat: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  listItemStatLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
  },
  boostList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  boostCard: {
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boostCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  boostCardTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  boostCardExpiry: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  endBoostButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  endBoostText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  bottomPadding: {
    height: 40,
  },
});
