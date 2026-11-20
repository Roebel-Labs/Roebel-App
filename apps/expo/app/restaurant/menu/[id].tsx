import React from 'react';
import { View, Text, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowLeftIcon } from '@/components/Icons';
import { useSpecialMenu } from '@/hooks/useSpecialMenu';
import MenuCategorySection from '@/components/MenuCategorySection';
import MeckyNotFound from '@/components/MeckyNotFound';
import CollapsingHeroScreen from '@/components/detail/CollapsingHeroScreen';
import { useTheme } from '@/context/ThemeContext';

const HERO_HEIGHT = 300;

export default function SpecialMenuDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { specialMenu, loading, refetch } = useSpecialMenu(id);
  const [refreshing, setRefreshing] = React.useState(false);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  async function onRefresh() { setRefreshing(true); await refetch(); setRefreshing(false); }

  if (loading) return (<><Stack.Screen options={{ headerShown: false }} /><CollapsingHeroScreen heroHeight={HERO_HEIGHT} onBack={() => router.back()} loading /></>);

  if (!specialMenu) return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}><Stack.Screen options={{ headerShown: false }} />
      <View style={styles.floatingBackContainer}><Pressable onPress={() => router.back()} style={[styles.floatingBackButton, { backgroundColor: colors.background }, shadows.backButton]}><ArrowLeftIcon size={24} color={colors.tabIconActive} /></Pressable></View>
      <MeckyNotFound title="Menü nicht gefunden" />
    </SafeAreaView>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CollapsingHeroScreen
        heroHeight={HERO_HEIGHT}
        imageUri={specialMenu.cover_image_url || null}
        heroBackgroundColor={colors.surfaceSecondary}
        renderHero={specialMenu.cover_image_url ? undefined : () => (
          <View style={[styles.heroPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            {specialMenu.restaurant?.logo_url ? <Image source={{ uri: specialMenu.restaurant.logo_url }} style={{ width: 180, height: 80 }} contentFit="contain" accessibilityIgnoresInvertColors /> : <Text style={[styles.heroPlaceholderName, { color: colors.textPrimary }]}>{specialMenu.restaurant?.name || specialMenu.name}</Text>}
          </View>
        )}
        title={specialMenu.name}
        onBack={() => router.back()}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.infoSection}>
          <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>{specialMenu.name}</Text>
          {specialMenu.description && <Text style={[styles.description, { color: colors.textPrimary }]}>{specialMenu.description}</Text>}
        </View>

        <View style={styles.menuSection}>
          {specialMenu.special_menu_categories?.map((category) => (<MenuCategorySection key={category.id} category={category} items={category.special_menu_items || []} />))}
          {(!specialMenu.special_menu_categories || specialMenu.special_menu_categories.length === 0) && <Text style={[styles.noMenuText, { color: colors.textSecondary }]}>Keine Menüpunkte verfügbar</Text>}
        </View>
      </CollapsingHeroScreen>
    </>
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
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholderName: {
    fontSize: 28,
    fontFamily: 'MonaSans-SemiBold',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  menuTitle: {
    fontSize: 26,
    fontFamily: 'MonaSans-Medium',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 22,
  },
  menuSection: {
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  noMenuText: {
    fontSize: 14,
    fontFamily: 'MonaSans-Regular',
    textAlign: 'center',
    padding: 32,
  },
});
