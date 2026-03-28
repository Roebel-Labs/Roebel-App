import React from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeftIcon } from '@/components/Icons';
import { useRestaurants } from '@/hooks/useRestaurants';
import RestaurantCard from '@/components/RestaurantCard';
import { useTheme } from '@/context/ThemeContext';

export default function RestaurantsListScreen() {
  const router = useRouter();
  const { restaurants, loading, refetch } = useRestaurants();
  const [refreshing, setRefreshing] = React.useState(false);
  const { colors } = useTheme();

  async function onRefresh() { setRefreshing(true); await refetch(); setRefreshing(false); }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButtonCircle, { backgroundColor: colors.surfaceSecondary }]}>
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitleCentered, { color: colors.textPrimary }]}>Speisekarten</Text>
        <View style={styles.headerSpacerCircle} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingTop: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loading ? (
          <View style={styles.loadingContainer}><Text style={[styles.loadingText, { color: colors.textSecondary }]}>Lade Restaurants...</Text></View>
        ) : restaurants.length === 0 ? (
          <View style={styles.emptyContainer}><Text style={styles.emptyEmoji}>🍽️</Text><Text style={[styles.emptyText, { color: colors.textSecondary }]}>Aktuell keine Restaurants verfügbar</Text></View>
        ) : (
          <View style={styles.grid}>
            {restaurants.map((restaurant) => (
              <View key={restaurant.id} style={styles.gridItem}><RestaurantCard restaurant={restaurant} /></View>
            ))}
          </View>
        )}
      </ScrollView>
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
    borderBottomWidth: 1,
  },
  backButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleCentered: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacerCircle: {
    width: 44,
    height: 44,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
});
