import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchActiveDeals } from '@/lib/supabase-deals';
import { DEAL_TYPE_LABELS } from '@/lib/map/constants';
import BusinessDealCard from '@/components/BusinessDealCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import type { BusinessDealWithBusiness, DealType } from '@/lib/types';

const FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'Alle' },
  ...Object.entries(DEAL_TYPE_LABELS).map(([key, label]) => ({ key, label })),
];

export default function DealsListScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [deals, setDeals] = useState<BusinessDealWithBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const fetchData = async () => {
    try {
      const data = await fetchActiveDeals();
      setDeals(data as BusinessDealWithBusiness[]);
    } catch (error) {
      console.error('Error fetching deals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const filteredDeals = useMemo(() => {
    if (selectedFilter === 'all') return deals;
    return deals.filter((d) => d.deal_type === selectedFilter);
  }, [deals, selectedFilter]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Angebote & Deals</Text>
        <View style={styles.backButton} />
      </View>

      {/* Filter Chips */}
      <FlatList
        horizontal
        data={FILTER_OPTIONS}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedFilter(item.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor: selectedFilter === item.key ? colors.primary : colors.surfaceSecondary,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: selectedFilter === item.key ? colors.onPrimary : colors.textPrimary },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        )}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterList}
      />

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredDeals}
          renderItem={({ item }) => <BusinessDealCard deal={item} compact={false} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Aktuell keine Angebote verfügbar
              </Text>
            </View>
          }
        />
      )}
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
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  filterList: {
    flexGrow: 0,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterChipText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  listContent: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
});
