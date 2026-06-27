import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { ArrowRight02Icon } from './Icons';
import MarketplaceCard from './MarketplaceCard';
import type { MarketplaceListingRecord } from '@/lib/types';

type Props = {
  listings: MarketplaceListingRecord[];
};

export default function MarketplaceSection({ listings }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const displayListings = useMemo(() => {
    return listings.slice(0, 6);
  }, [listings]);

  if (displayListings.length === 0) {
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
        data={displayListings}
        renderItem={({ item }) => <MarketplaceCard listing={item} compact />}
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
