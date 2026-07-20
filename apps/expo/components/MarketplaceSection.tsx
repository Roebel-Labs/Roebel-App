import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { ArrowRight02Icon } from './Icons';
import MarketplaceCard from './MarketplaceCard';
import BusinessDealCard from './BusinessDealCard';
import type { MarketplaceListingRecord, BusinessDealWithBusiness } from '@/lib/types';

type Props = {
  listings: MarketplaceListingRecord[];
  deals?: BusinessDealWithBusiness[];
};

type RailItem =
  | { kind: 'deal'; id: string; data: BusinessDealWithBusiness }
  | { kind: 'listing'; id: string; data: MarketplaceListingRecord };

export default function MarketplaceSection({ listings, deals }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const displayDeals = useMemo(() => (deals ?? []).slice(0, 4), [deals]);
  const displayListings = useMemo(() => listings.slice(0, 6), [listings]);

  // Deals are promotional, so they lead the rail; listings follow.
  const railItems: RailItem[] = useMemo(
    () => [
      ...displayDeals.map((d) => ({ kind: 'deal' as const, id: `deal-${d.id}`, data: d })),
      ...displayListings.map((l) => ({ kind: 'listing' as const, id: `listing-${l.id}`, data: l })),
    ],
    [displayDeals, displayListings]
  );

  if (railItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Marktplatz</Text>
        <Pressable
          style={[styles.viewAllButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={() => router.push('/marketplace' as any)}
          accessibilityRole="button"
          accessibilityLabel="Alle Marktplatz-Anzeigen anzeigen"
        >
          <ArrowRight02Icon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={railItems}
        renderItem={({ item }) =>
          item.kind === 'deal' ? (
            <BusinessDealCard deal={item.data} compact />
          ) : (
            <MarketplaceCard listing={item.data} compact />
          )
        }
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  viewAllButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
  },
});
