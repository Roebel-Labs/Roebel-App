import React from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowLeftIcon, CallIcon, LocationSmallIcon } from '@/components/Icons';
import { useRestaurantDetail } from '@/hooks/useRestaurantDetail';
import SpecialMenuGrid from '@/components/SpecialMenuGrid';
import { RestaurantDetailSkeleton } from '@/components/SkeletonLoader';
import MenuCategorySection from '@/components/MenuCategorySection';
import MeckyNotFound from '@/components/MeckyNotFound';
import { isRestaurantOpen } from '@/lib/utils';
import { logRestaurantView } from '@/lib/firebase';
import { useTheme } from '@/context/ThemeContext';

export default function RestaurantDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { restaurant, loading, refetch } = useRestaurantDetail(slug);
  const [refreshing, setRefreshing] = React.useState(false);
  const { colors } = useTheme();

  React.useEffect(() => { if (restaurant && slug) logRestaurantView(slug, restaurant.name); }, [restaurant, slug]);

  // If this restaurant is linked to an org account, prefer the unified gastro account view.
  React.useEffect(() => {
    if (restaurant && (restaurant as any).account_id) {
      router.replace(`/account/${(restaurant as any).account_id}`);
    }
  }, [restaurant, router]);

  async function onRefresh() { setRefreshing(true); await refetch(); setRefreshing(false); }

  const openStatus = restaurant ? isRestaurantOpen(restaurant.opening_hours) : null;
  const activeSpecialMenus = restaurant?.special_menus?.filter(menu => menu.status === 'published') || [];

  if (loading) return (<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}><Stack.Screen options={{ headerShown: false }} /><RestaurantDetailSkeleton /></SafeAreaView>);

  if (!restaurant) return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}><Stack.Screen options={{ headerShown: false }} />
      <View style={styles.floatingBackContainer}><Pressable onPress={() => router.back()} style={[styles.floatingBackButton, { backgroundColor: colors.background }, shadows.backButton]}><ArrowLeftIcon size={24} color={colors.tabIconActive} /></Pressable></View>
      <MeckyNotFound title="Restaurant nicht gefunden" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Hero */}
        <View style={styles.heroContainer}>
          {restaurant.cover_image_url ? (
            <Image source={{ uri: restaurant.cover_image_url }} style={styles.heroImage} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
              {restaurant.logo_url ? <Image source={{ uri: restaurant.logo_url }} style={{ width: 180, height: 80 }} contentFit="contain" accessibilityIgnoresInvertColors /> : <Text style={[styles.heroPlaceholderName, { color: colors.textPrimary }]}>{restaurant.name}</Text>}
            </View>
          )}
          <View style={styles.floatingBackContainer}><Pressable onPress={() => router.back()} style={[styles.floatingBackButton, { backgroundColor: colors.background }, shadows.backButton]}><ArrowLeftIcon size={24} color={colors.tabIconActive} /></Pressable></View>
          {openStatus && (<View style={[styles.statusBadge, { backgroundColor: openStatus.isOpen ? colors.successBackground : colors.errorBackground }]}><Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: openStatus.isOpen ? colors.success : colors.error }}>{openStatus.isOpen ? 'Geöffnet' : 'Geschlossen'}</Text></View>)}
        </View>

        <View style={styles.infoSection}>
          <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>Speisekarte</Text>
          {restaurant.description && <Text style={[styles.description, { color: colors.textPrimary }]}>{restaurant.description}</Text>}
          {(restaurant.address || restaurant.phone) && (
            <View style={styles.contactRow}>
              {restaurant.address && (<View style={styles.contactItem}><LocationSmallIcon size={14} color={colors.textSecondary} /><Text style={[styles.contactText, { color: colors.textPrimary }]}>{restaurant.address}</Text></View>)}
              {restaurant.phone && (<Pressable style={styles.contactItem} onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}><CallIcon size={14} color={colors.textSecondary} /><Text style={[styles.contactText, { color: colors.textPrimary }]}>{restaurant.phone}</Text></Pressable>)}
            </View>
          )}
        </View>

        {activeSpecialMenus.length > 0 && <View style={styles.specialMenuSection}><SpecialMenuGrid menus={activeSpecialMenus} /></View>}

        <View style={styles.menuSection}>
          {restaurant.menu_categories?.map((category) => (<MenuCategorySection key={category.id} category={category} items={category.menu_items || []} />))}
          {(!restaurant.menu_categories || restaurant.menu_categories.length === 0) && <Text style={[styles.noMenuText, { color: colors.textSecondary }]}>Keine Speisekarte verfügbar</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const shadows = StyleSheet.create({
  backButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingBackContainer: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
  },
  floatingBackButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContainer: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholderName: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
  },
  statusBadge: {
    position: 'absolute',
    top: 50,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 16,
  },
  menuTitle: {
    fontSize: 26,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 16,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  specialMenuSection: {
    paddingTop: 32,
    paddingBottom: 16,
  },
  menuSection: {
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  noMenuText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    padding: 32,
  },
});
