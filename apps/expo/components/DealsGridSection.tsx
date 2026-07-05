import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import BusinessDealCard from './BusinessDealCard';
import type { BusinessDealWithBusiness } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 12;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

type Props = {
  deals: BusinessDealWithBusiness[];
};

export default function DealsGridSection({ deals }: Props) {
  const { colors } = useTheme();

  const displayDeals = useMemo(() => {
    return deals.slice(0, 4);
  }, [deals]);

  if (displayDeals.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Angebote & Deals</Text>
      </View>
      <View style={styles.grid}>
        {displayDeals.map((item) => (
          <BusinessDealCard
            key={item.id}
            deal={item}
            compact
            style={{ width: CARD_WIDTH, marginRight: 0 }}
          />
        ))}
      </View>
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
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
});
