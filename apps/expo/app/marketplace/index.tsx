import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { MARKETPLACE_CATEGORY_LABELS } from '@/lib/map/constants';
import MarketplaceCard from '@/components/MarketplaceCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import type { MarketplaceListingRecord } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_GAP = 12;
const PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - PADDING * 2 - COLUMN_GAP) / 2;

const FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'Alle' },
  ...Object.entries(MARKETPLACE_CATEGORY_LABELS).map(([key, label]) => ({ key, label })),
];

export default function MarketplaceListScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const fetchData = async () => {
    try {
      const data = await fetchMarketplaceListings();
      setListings(data);
    } catch (error) {
      console.error('Error fetching listings:', error);
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

  const filteredListings = useMemo(() => {
    if (selectedFilter === 'all') return listings;
    return listings.filter((l) => l.category === selectedFilter);
  }, [listings, selectedFilter]);

  const renderItem = ({ item }: { item: MarketplaceListingRecord }) => (
    <View style={{ width: CARD_WIDTH }}>
      <MarketplaceCard listing={item} compact style={{ width: CARD_WIDTH, marginRight: 0 }} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Marktplatz</Text>
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
          data={filteredListings}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Keine Anzeigen verfügbar
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
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  columnWrapper: {
    gap: COLUMN_GAP,
    marginBottom: 16,
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
