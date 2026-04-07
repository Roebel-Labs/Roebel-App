import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useOrderSession } from '@/context/OrderSessionContext';
import OrderableMenuItemCard from '@/components/order/OrderableMenuItemCard';
import { formatMenuPrice } from '@/lib/utils';

export default function OrderMenuScreen() {
  const router = useRouter();
  const { slug, table } = useLocalSearchParams<{ slug: string; table: string }>();
  const { colors } = useTheme();
  const { restaurant, cart, addToCart, cartTotal, isLoading } = useOrderSession();

  if (isLoading || !restaurant) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const categories = restaurant.menu_categories || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 20, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{restaurant.name}</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginTop: 2 }}>Speisekarte</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {categories.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: colors.textTertiary }}>Keine Speisekarte vorhanden</Text>
          </View>
        ) : (
          categories.map((cat) => (
            <View key={cat.id} style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 17, fontFamily: 'Inter-Medium', color: colors.textPrimary, paddingHorizontal: 16, marginBottom: 8 }}>
                {cat.name}
              </Text>
              {(cat.menu_items || []).filter((i: any) => i.is_available !== false).map((item: any) => (
                <OrderableMenuItemCard key={item.id} item={item} onAdd={addToCart} />
              ))}
            </View>
          ))
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {cart.length > 0 && (
        <Pressable
          onPress={() => router.push(`/order/${slug}/${table}/cart` as any)}
          style={{ position: 'absolute', bottom: 32, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}
        >
          <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 }}>
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>{cart.reduce((s, c) => s + c.quantity, 0)}</Text>
          </View>
          <Text style={{ color: colors.onPrimary, fontSize: 16, fontFamily: 'Inter-Medium' }}>Warenkorb ansehen</Text>
          <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>{formatMenuPrice(cartTotal)}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
