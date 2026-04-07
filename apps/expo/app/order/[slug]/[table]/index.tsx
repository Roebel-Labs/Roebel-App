import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useOrderSession } from '@/context/OrderSessionContext';
import { fetchSpecialMenuById } from '@/lib/supabase-restaurants';
import OrderMenuItemGrid from '@/components/order/OrderMenuItemGrid';
import { formatMenuPrice } from '@/lib/utils';
import type { SpecialMenuWithDetails, MenuItemRecord } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COVER_HEIGHT = 180;
const LOGO_SIZE = 64;
const GRID_GAP = 12;
const GRID_PAD = 16;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PAD * 2 - GRID_GAP) / 2;

export default function OrderMenuScreen() {
  const router = useRouter();
  const { slug, table } = useLocalSearchParams<{ slug: string; table: string }>();
  const { colors, isDark } = useTheme();
  const { restaurant, cart, addToCart, cartTotal, isLoading } = useOrderSession();

  const [expandedSpecialMenu, setExpandedSpecialMenu] = useState<string | null>(null);
  const [specialMenuDetails, setSpecialMenuDetails] = useState<Record<string, SpecialMenuWithDetails>>({});

  // Build a lookup of cart quantities by item id
  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cart) {
      map[c.menuItem.id] = (map[c.menuItem.id] || 0) + c.quantity;
    }
    return map;
  }, [cart]);

  // Fetch special menu details when expanded
  useEffect(() => {
    if (!expandedSpecialMenu || specialMenuDetails[expandedSpecialMenu]) return;
    fetchSpecialMenuById(expandedSpecialMenu).then((data) => {
      if (data) {
        setSpecialMenuDetails((prev) => ({ ...prev, [expandedSpecialMenu]: data }));
      }
    });
  }, [expandedSpecialMenu]);

  if (isLoading || !restaurant) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const categories = (restaurant.menu_categories || []).filter(
    (cat) => (cat.menu_items || []).some((i) => i.is_available !== false)
  );

  const today = new Date().toISOString().split('T')[0];
  const activeSpecialMenus = (restaurant.special_menus || []).filter(
    (sm) => sm.status === 'published' && (!sm.end_date || sm.end_date >= today)
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero Section ── */}
        <View style={styles.heroContainer}>
          {restaurant.cover_image_url ? (
            <Image
              source={{ uri: restaurant.cover_image_url }}
              style={[styles.coverImage, { backgroundColor: restaurant.background_color }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.coverImage, { backgroundColor: restaurant.background_color }]} />
          )}

          <View style={styles.logoContainer}>
            {restaurant.logo_url ? (
              <Image
                source={{ uri: restaurant.logo_url }}
                style={styles.logo}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.logo, { backgroundColor: colors.surface }]}>
                <Text style={[styles.logoFallback, { color: colors.primary }]}>
                  {restaurant.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.restaurantName, { color: colors.textPrimary }]}>
            {restaurant.name}
          </Text>
          {restaurant.address ? (
            <Text style={[styles.restaurantAddress, { color: colors.textSecondary }]}>
              {restaurant.address}
            </Text>
          ) : null}
        </View>

        {/* ── Special Menus (Mittagstisch) ── */}
        {activeSpecialMenus.length > 0 && (
          <View style={styles.specialMenuSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specialMenuScroll}>
              {activeSpecialMenus.map((sm) => {
                const isExpanded = expandedSpecialMenu === sm.id;
                return (
                  <Pressable
                    key={sm.id}
                    onPress={() => setExpandedSpecialMenu(isExpanded ? null : sm.id)}
                    style={[
                      styles.specialMenuChip,
                      { backgroundColor: isExpanded ? colors.primary : colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.specialMenuChipText,
                        { color: isExpanded ? colors.onPrimary : colors.textPrimary },
                      ]}
                      numberOfLines={1}
                    >
                      {sm.name}
                    </Text>
                    {sm.price != null && (
                      <Text
                        style={[
                          styles.specialMenuChipPrice,
                          { color: isExpanded ? colors.onPrimary : colors.textSecondary },
                        ]}
                      >
                        {formatMenuPrice(sm.price)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Expanded special menu items */}
            {expandedSpecialMenu && specialMenuDetails[expandedSpecialMenu] && (
              <View style={styles.sectionContent}>
                {specialMenuDetails[expandedSpecialMenu].special_menu_categories.map((cat) => (
                  <View key={cat.id}>
                    <Text style={[styles.categoryName, { color: colors.textSecondary }]}>
                      {cat.name}
                    </Text>
                    <View style={styles.grid}>
                      {cat.special_menu_items.map((smi) => {
                        // Convert special menu item to MenuItemRecord-like shape for the grid
                        const asMenuItem: MenuItemRecord = {
                          id: smi.id,
                          restaurant_id: restaurant.id,
                          category_id: smi.category_id,
                          name: smi.name,
                          description: smi.description,
                          price: smi.price ?? 0,
                          is_vegetarian: smi.is_vegetarian,
                          is_vegan: false,
                          is_available: true,
                          sort_order: smi.sort_order,
                          created_at: '',
                        };
                        return (
                          <View key={smi.id} style={styles.gridItem}>
                            <OrderMenuItemGrid
                              item={asMenuItem}
                              quantity={cartQuantities[smi.id] || 0}
                              onAdd={addToCart}
                            />
                          </View>
                        );
                      })}
                      {/* Odd-count spacer */}
                      {cat.special_menu_items.length % 2 !== 0 && <View style={styles.gridItem} />}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Regular Menu Categories ── */}
        {categories.length === 0 && activeSpecialMenus.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              Keine Speisekarte vorhanden
            </Text>
          </View>
        ) : (
          categories.map((cat) => {
            const items = (cat.menu_items || []).filter((i) => i.is_available !== false);
            return (
              <View key={cat.id} style={styles.sectionContent}>
                <Text style={[styles.categoryName, { color: colors.textSecondary }]}>
                  {cat.name}
                </Text>
                <View style={styles.grid}>
                  {items.map((item) => (
                    <View key={item.id} style={styles.gridItem}>
                      <OrderMenuItemGrid
                        item={item}
                        quantity={cartQuantities[item.id] || 0}
                        onAdd={addToCart}
                      />
                    </View>
                  ))}
                  {/* Odd-count spacer */}
                  {items.length % 2 !== 0 && <View style={styles.gridItem} />}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Cart FAB ── */}
      {cart.length > 0 && (
        <Pressable
          onPress={() => router.push(`/order/${slug}/${table}/cart` as any)}
          style={[styles.cartFab, { backgroundColor: colors.primary }]}
        >
          <View style={styles.cartBadge}>
            <Text style={[styles.cartBadgeText, { color: colors.onPrimary }]}>
              {cart.reduce((s, c) => s + c.quantity, 0)}
            </Text>
          </View>
          <Text style={[styles.cartLabel, { color: colors.onPrimary }]}>Warenkorb ansehen</Text>
          <Text style={[styles.cartTotal, { color: colors.onPrimary }]}>{formatMenuPrice(cartTotal)}</Text>
        </Pressable>
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
  scroll: {
    flex: 1,
  },

  // Hero
  heroContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  coverImage: {
    width: SCREEN_WIDTH,
    height: COVER_HEIGHT,
  },
  logoContainer: {
    marginTop: -(LOGO_SIZE / 2),
    borderRadius: LOGO_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFallback: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
  },
  restaurantName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  restaurantAddress: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  // Special menus
  specialMenuSection: {
    marginBottom: 8,
  },
  specialMenuScroll: {
    paddingHorizontal: GRID_PAD,
    gap: 10,
  },
  specialMenuChip: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  specialMenuChipText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  specialMenuChipPrice: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },

  // Categories
  sectionContent: {
    paddingHorizontal: GRID_PAD,
    marginTop: 20,
  },
  categoryName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridItem: {
    width: ITEM_WIDTH,
  },

  // Empty
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },

  // Cart FAB
  cartFab: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cartBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  cartBadgeText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  cartLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  cartTotal: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
