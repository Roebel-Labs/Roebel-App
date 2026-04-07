import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
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
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const categories = restaurant?.menu_categories || [];
  const totalItems = categories.reduce((sum, cat) => sum + (cat.menu_items || []).filter((i: any) => i.is_available !== false).length, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Bestellung — Tisch {session?.table_number}
        </Text>
      </View>

      {/* Search bar (staff only feature) - only show when items exist */}
      {totalItems > 0 && (
        <View style={styles.searchBar}>
          <TextInput
            placeholder="Gericht suchen..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            autoFocus
          />
        </View>
      )}

      {/* Search results dropdown */}
      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          <ScrollView style={[styles.searchResultsInner, { backgroundColor: colors.surface }]}>
            {searchResults.map(item => (
              <Pressable
                key={item.id}
                onPress={() => addToCart(item)}
                style={[styles.searchResultItem, { borderBottomColor: colors.borderSecondary }]}
              >
                <Text style={[styles.searchResultName, { color: colors.textPrimary }]}>{item.name}</Text>
                <Text style={[styles.searchResultPrice, { color: colors.textSecondary }]}>{formatMenuPrice(item.price)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView style={styles.scrollContent}>
        {/* Empty state when no menu items exist */}
        {totalItems === 0 && !searchQuery.trim() && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>Keine Gerichte vorhanden</Text>
            <Text style={[styles.emptyStateSubtitle, { color: colors.textSecondary }]}>
              Füge zuerst Gerichte über die Speisekarte hinzu, um Bestellungen aufnehmen zu können.
            </Text>
            <Pressable
              onPress={() => router.push('/menu' as any)}
              style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.emptyStateBtnText, { color: colors.onPrimary }]}>Speisekarte bearbeiten</Text>
            </Pressable>
          </View>
        )}

        {/* Full menu browse (when not searching) */}
        {!searchQuery.trim() && categories.map(cat => {
          const items = (cat.menu_items || []).filter((i: any) => i.is_available !== false);
          if (items.length === 0) return null;
          return (
            <View key={cat.id} style={styles.menuCategory}>
              <Text style={[styles.categoryName, { color: colors.textSecondary }]}>{cat.name}</Text>
              {items.map((item: any) => (
                <Pressable
                  key={item.id}
                  onPress={() => addToCart(item)}
                  style={[styles.menuItem, { borderBottomColor: colors.borderSecondary }]}
                >
                  <Text style={[styles.menuItemName, { color: colors.textPrimary }]}>{item.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[styles.menuItemPrice, { color: colors.textSecondary }]}>{formatMenuPrice(item.price)}</Text>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ color: colors.onPrimary, fontSize: 16, fontFamily: 'Inter-Medium' }}>+</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })}
        <View style={styles.scrollSpacer} />
      </ScrollView>

      {/* Cart + submit */}
      {cart.length > 0 && (
        <View style={[styles.cartPanel, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {cart.map((c, i) => (
            <View key={i} style={styles.cartRow}>
              <Text style={[styles.cartItemName, { color: colors.textPrimary }]}>{c.quantity}x {c.menuItem.name}</Text>
              <Pressable onPress={() => removeFromCart(i)}>
                <Text style={styles.removeText}>Entfernen</Text>
              </Pressable>
            </View>
          ))}
          <TextInput
            placeholder="Gastname (optional)"
            placeholderTextColor={colors.textTertiary}
            value={guestName}
            onChangeText={setGuestName}
            style={[styles.guestInput, { backgroundColor: colors.background, color: colors.textPrimary }]}
          />
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.6 : 1 }]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>
                Bestellung aufgeben ({formatMenuPrice(cartTotal)})
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerBack: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  searchResults: {
    paddingHorizontal: 16,
    maxHeight: 200,
  },
  searchResultsInner: {
    borderRadius: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchResultName: {
    fontSize: 14,
    flex: 1,
  },
  searchResultPrice: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Medium',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyStateBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  emptyStateBtnText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  menuCategory: {
    marginBottom: 16,
  },
  categoryName: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  menuItemName: {
    fontSize: 14,
    flex: 1,
  },
  menuItemPrice: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  scrollSpacer: {
    height: 200,
  },
  cartPanel: {
    borderTopWidth: 1,
    padding: 16,
  },
  cartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  cartItemName: {
    fontSize: 14,
  },
  removeText: {
    fontSize: 13,
    color: '#DC2626',
  },
  guestInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 10,
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
