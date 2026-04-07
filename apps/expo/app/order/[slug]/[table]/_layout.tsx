import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRestaurantDetail } from '@/hooks/useRestaurantDetail';
import { OrderSessionProvider } from '@/context/OrderSessionContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OrderLayout() {
  const { slug, table } = useLocalSearchParams<{ slug: string; table: string }>();
  const { restaurant, loading } = useRestaurantDetail(slug || '');
  const { colors } = useTheme();

  if (loading || !restaurant) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <OrderSessionProvider restaurant={restaurant} tableNumber={table || '1'}>
      <Slot />
    </OrderSessionProvider>
  );
}
