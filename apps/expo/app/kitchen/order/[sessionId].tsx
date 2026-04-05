import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { submitOrder, searchMenuItems } from '@/lib/supabase-orders';
import { fetchRestaurantBySlug } from '@/lib/supabase-restaurants';
import { formatMenuPrice } from '@/lib/utils';
import type { MenuItemRecord, RestaurantWithMenus } from '@/lib/types';
import type { CartItem, OrderItem, TableSession } from '@/lib/types/orders';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function StaffOrderScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const [session, setSession] = useState<TableSession | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantWithMenus | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [guestName, setGuestName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MenuItemRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load session and restaurant data
  useEffect(() => {
    if (!sessionId) return;

    async function load() {
      const { data: sess } = await supabase
        .from('table_sessions' as any)
        .select('*')
        .eq('id', sessionId)
        .single();

      if (!sess) { setLoading(false); return; }
      setSession(sess as TableSession);

      const { data: rest } = await supabase
        .from('restaurants')
        .select('slug')
        .eq('id', (sess as any).restaurant_id)
        .single();

      if (rest?.slug) {
        const full = await fetchRestaurantBySlug(rest.slug);
        setRestaurant(full);
      }
      setLoading(false);
    }
    load();
  }, [sessionId]);

  // Search menu items with debounce
  useEffect(() => {
    if (!searchQuery.trim() || !session?.restaurant_id) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const results = await searchMenuItems(session.restaurant_id, searchQuery.trim());
      setSearchResults(results);
    }, 200);

    return () => clearTimeout(timeout);
  }, [searchQuery, session?.restaurant_id]);

  const addToCart = (item: MenuItemRecord) => {
    setCart(prev => {
      const existing = prev.findIndex(c => c.menuItem.id === item.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return updated;
      }
      return [...prev, { menuItem: item, quantity: 1, notes: null }];
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);

  const handleSubmit = async () => {
    if (cart.length === 0 || !session) return;

    setIsSubmitting(true);
    try {
      const items: OrderItem[] = cart.map(c => ({
        menu_item_id: c.menuItem.id,
        name: c.menuItem.name,
        price: c.menuItem.price,
        quantity: c.quantity,
        notes: c.notes,
      }));

      const staffToken = `staff-${Date.now()}`;
      await submitOrder(session.id, staffToken, guestName.trim() || null, items, 'staff');
      router.back();
    } catch {
      Alert.alert('Fehler', 'Bestellung konnte nicht aufgegeben werden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const categories = restaurant?.menu_categories || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
          Bestellung — Tisch {session?.table_number}
        </Text>
      </View>

      {/* Search bar (staff only feature) */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <TextInput
          placeholder="Gericht suchen..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}
          autoFocus
        />
      </View>

      {/* Search results dropdown */}
      {searchResults.length > 0 && (
        <View style={{ paddingHorizontal: 16, maxHeight: 200 }}>
          <ScrollView style={{ backgroundColor: colors.surface, borderRadius: 12 }}>
            {searchResults.map(item => (
              <Pressable
                key={item.id}
                onPress={() => addToCart(item)}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSecondary }}
              >
                <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1 }}>{item.name}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>{formatMenuPrice(item.price)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Full menu browse (when not searching) */}
        {!searchQuery.trim() && categories.map(cat => (
          <View key={cat.id} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary, marginBottom: 6 }}>{cat.name}</Text>
            {(cat.menu_items || []).filter((i: any) => i.is_available !== false).map((item: any) => (
              <Pressable
                key={item.id}
                onPress={() => addToCart(item)}
                style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSecondary }}
              >
                <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1 }}>{item.name}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>{formatMenuPrice(item.price)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Cart + submit */}
      {cart.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 16 }}>
          {cart.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: 14, color: colors.textPrimary }}>{c.quantity}x {c.menuItem.name}</Text>
              <Pressable onPress={() => removeFromCart(i)}>
                <Text style={{ fontSize: 13, color: '#DC2626' }}>Entfernen</Text>
              </Pressable>
            </View>
          ))}
          <TextInput
            placeholder="Gastname (optional)"
            placeholderTextColor={colors.textTertiary}
            value={guestName}
            onChangeText={setGuestName}
            style={{ backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.textPrimary, marginTop: 10 }}
          />
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10, opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>
                Bestellung aufgeben ({formatMenuPrice(cartTotal)})
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
