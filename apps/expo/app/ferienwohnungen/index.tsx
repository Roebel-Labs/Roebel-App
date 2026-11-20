import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ArrowLeftIcon } from '@/components/Icons';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';
import {
  VACATION_RENTALS_QUERY_KEY,
  fetchVacationRentals,
  formatEuro,
  rentalFactsLine,
  type VacationRental,
} from '@/lib/vacation-rentals';

/** All Ferienwohnungen, one large photo card each. */
export default function VacationRentalsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: VACATION_RENTALS_QUERY_KEY,
    queryFn: fetchVacationRentals,
    meta: { persist: true },
  });

  const renderItem = useCallback(
    ({ item }: { item: VacationRental }) => (
      <Pressable
        onPress={() => router.push(`/ferienwohnungen/${item.slug}` as never)}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatEuro(item.price_per_night)} pro Nacht`}
      >
        <View style={[styles.cover, { backgroundColor: colors.surfaceSecondary }]}>
          {item.images[0] ? (
            <Image
              source={{ uri: item.images[0] }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.images[0]}
              transition={150}
            />
          ) : null}
          {item.badge ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{item.badge}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.price, { color: colors.textPrimary }]}>
            {formatEuro(item.price_per_night)}
            <Text style={[styles.unit, { color: colors.textSecondary }]}> / Nacht</Text>
          </Text>
        </View>
        <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>
          {[item.kind_label, item.host?.name].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>
          {rentalFactsLine(item)}
        </Text>
      </Pressable>
    ),
    [router, colors]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ArrowLeftIcon size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ferienwohnungen</Text>
      </View>
      {query.isPending ? (
        <View style={styles.list}>
          <ShimmerSkeleton width="100%" height={260} borderRadius={16} />
          <ShimmerSkeleton width="60%" height={20} style={{ marginTop: 12 } as any} />
        </View>
      ) : (
        <FlatList
          data={query.data ?? []}
          renderItem={renderItem}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Gerade sind keine Ferienwohnungen eingetragen.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontFamily: fontFamily.heading },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  card: { marginBottom: 28 },
  cover: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, overflow: 'hidden' },
  pill: {
    position: 'absolute',
    top: 12,
    left: 12,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  pillText: { fontSize: 14, fontFamily: fontFamily.semiBold, color: '#000' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  title: { fontSize: 18, fontFamily: fontFamily.semiBold, flexShrink: 1 },
  price: { fontSize: 16, fontFamily: fontFamily.semiBold },
  unit: { fontFamily: fontFamily.regular },
  line: { fontSize: 15, fontFamily: fontFamily.regular, marginTop: 2 },
  empty: { fontSize: 15, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 48 },
});
