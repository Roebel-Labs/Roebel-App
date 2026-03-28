import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import MarketplaceCard from './MarketplaceCard';
import type { MarketplaceListingRecord } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 12;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

type Props = {
  listings: MarketplaceListingRecord[];
};

export default function MarketplaceSection({ listings }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const displayListings = useMemo(() => {
    return listings.slice(0, 4);
  }, [listings]);

  if (displayListings.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Marktplatz</Text>
      </View>
      <View style={styles.grid}>
        {displayListings.map((item) => (
          <MarketplaceCard
            key={item.id}
            listing={item}
            compact
            style={{ width: CARD_WIDTH, marginRight: 0 }}
          />
        ))}
      </View>
      <Pressable
        style={[styles.viewAllButton, { borderColor: colors.border }]}
        onPress={() => router.push('/marketplace' as any)}
      >
        <Text style={[styles.viewAllText, { color: colors.textPrimary }]}>Alles anzeigen</Text>
      </Pressable>
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
    paddingHorizontal: GRID_PADDING,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  viewAllButton: {
    marginHorizontal: GRID_PADDING,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
