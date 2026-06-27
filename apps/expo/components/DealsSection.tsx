import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { ArrowRight02Icon } from './Icons';
import BusinessDealCard from './BusinessDealCard';
import type { BusinessDealWithBusiness } from '@/lib/types';

type Props = {
  deals: BusinessDealWithBusiness[];
};

export default function DealsSection({ deals }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const displayDeals = useMemo(() => {
    return deals.slice(0, 6);
  }, [deals]);

  if (displayDeals.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Angebote & Deals</Text>
        <Pressable
          style={[styles.viewAllButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={() => router.push('/deals' as any)}
          accessibilityRole="button"
          accessibilityLabel="Alle Angebote anzeigen"
        >
          <ArrowRight02Icon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={displayDeals}
        renderItem={({ item }) => <BusinessDealCard deal={item} compact />}
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
