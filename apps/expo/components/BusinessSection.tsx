import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import BusinessCardCompact from './BusinessCardCompact';
import type { BusinessRecord } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 12;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

type Props = {
  businesses: BusinessRecord[];
};

export default function BusinessSection({ businesses }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const displayBusinesses = useMemo(() => {
    // Featured first, then alphabetical
    const sorted = [...businesses].sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return a.name.localeCompare(b.name);
    });
    return sorted.slice(0, 8);
  }, [businesses]);

  if (displayBusinesses.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Lokale Unternehmen</Text>
        <Pressable
          style={[styles.viewAllButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={() => router.push('/businesses' as any)}
        >
          <Text style={[styles.viewAllText, { color: colors.textPrimary }]}>Alle anzeigen</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {displayBusinesses.map((item) => (
          <BusinessCardCompact
            key={item.id}
            business={item}
            compact
            style={{ width: CARD_WIDTH }}
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
    fontFamily: 'Inter-Medium',
  },
  viewAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  viewAllText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
});
