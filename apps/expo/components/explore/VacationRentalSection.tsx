import React, { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { placeCardStyles } from '@/components/GastroCard';
import { RAIL_LIST_PROPS } from '@/components/railListProps';
import { ArrowRight02Icon } from '@/components/Icons';
import {
  VACATION_RENTALS_QUERY_KEY,
  fetchVacationRentals,
  formatEuro,
  guestsLabel,
  type VacationRental,
} from '@/lib/vacation-rentals';

function RentalCard({ rental }: { rental: VacationRental }) {
  const router = useRouter();
  const { colors } = useTheme();
  const cover = rental.images[0];
  return (
    <Pressable
      onPress={() => router.push(`/ferienwohnungen/${rental.slug}` as never)}
      style={({ pressed }) => [placeCardStyles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${rental.title}, ${formatEuro(rental.price_per_night)} pro Nacht`}
    >
      <View style={[placeCardStyles.cover, { backgroundColor: colors.surfaceSecondary }]}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={cover}
            transition={150}
          />
        ) : null}
        {rental.badge ? (
          <View style={placeCardStyles.pill}>
            <Text style={placeCardStyles.pillText}>{rental.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {rental.title}
      </Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
        {[rental.host?.name, `bis ${guestsLabel(rental.max_guests)}`].filter(Boolean).join(' · ')}
      </Text>
      <Text style={[styles.price, { color: colors.textPrimary }]}>
        {formatEuro(rental.price_per_night)}
        <Text style={[styles.priceUnit, { color: colors.textSecondary }]}> / Nacht</Text>
      </Text>
    </Pressable>
  );
}

const renderItem = ({ item }: { item: VacationRental }) => <RentalCard rental={item} />;
const keyExtractor = (item: VacationRental) => item.id;

/** Ferienwohnungen rail on Erkunden; hidden while there is nothing to show. */
function VacationRentalSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data } = useQuery({
    queryKey: VACATION_RENTALS_QUERY_KEY,
    queryFn: fetchVacationRentals,
    meta: { persist: true },
  });

  const openAll = useCallback(() => router.push('/ferienwohnungen' as never), [router]);

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ferienwohnungen</Text>
        <Pressable
          style={[styles.showAllButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={openAll}
          accessibilityRole="button"
          accessibilityLabel="Alle Ferienwohnungen anzeigen"
        >
          <ArrowRight02Icon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        {...RAIL_LIST_PROPS}
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
  title: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  showAllButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.9,
  },
  name: {
    fontSize: 18,
    fontFamily: fontFamily.semiBold,
    marginTop: 10,
  },
  meta: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  price: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    marginTop: 4,
  },
  priceUnit: {
    fontFamily: fontFamily.regular,
  },
});

export default memo(VacationRentalSection);
