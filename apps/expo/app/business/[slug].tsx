import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
  Share,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useActiveAccount } from 'thirdweb/react';
import { isRestaurantOpen } from '@/lib/utils';
import { fetchBusinessBySlug } from '@/lib/supabase-businesses';
import { fetchDealsByBusiness } from '@/lib/supabase-deals';
import MeckyNotFound from '@/components/MeckyNotFound';
import { BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import {
  ArrowLeftIcon,
  CallIcon,
  LocationSmallIcon,
  MailIcon,
  ShareIcon,
} from '@/components/Icons';
import BusinessDealCard from '@/components/BusinessDealCard';
import type { BusinessRecord, BusinessDealRecord, OpeningHours } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 9 / 16);

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_LABELS: { key: DayOfWeek; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

function getCurrentDayKey(): DayOfWeek {
  const dayMap: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return dayMap[new Date().getDay()];
}

export default function BusinessDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const account = useActiveAccount();

  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [deals, setDeals] = useState<BusinessDealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!slug) return;
    try {
      setLoading(true);
      const data = await fetchBusinessBySlug(slug);
      setBusiness(data);
      if (data) {
        const businessDeals = await fetchDealsByBusiness(data.id);
        setDeals(businessDeals.filter((d) => d.status === 'active' && d.is_active));
      }
    } catch (error) {
      console.error('Error fetching business:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [slug]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleShare = async () => {
    if (!business) return;
    try {
      await Share.share({ message: `${business.name}${business.address ? ` - ${business.address}` : ''}\nhttps://www.roebel.app/app/gewerbe/${business.slug}` });
    } catch {}
  };

  const handleCall = () => {
    if (business?.phone) Linking.openURL(`tel:${business.phone}`);
  };

  const handleDirections = () => {
    if (!business?.address) return;
    const query = encodeURIComponent(business.address);
    Linking.openURL(`https://maps.apple.com/?q=${query}`);
  };

  const openStatus = business ? isRestaurantOpen(business.opening_hours) : null;
  const categoryLabel = business ? (BUSINESS_CATEGORY_LABELS[business.category] || 'Sonstiges') : '';
  const isOwner = !!account?.address && !!business?.owner_wallet_address &&
    account.address.toLowerCase() === business.owner_wallet_address.toLowerCase();
  const currentDay = getCurrentDayKey();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.headerAbsolute}>
          <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.background }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Laden...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.headerAbsolute}>
          <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.background }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
        </View>
        <MeckyNotFound title="Unternehmen nicht gefunden" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          {business.cover_image_url ? (
            <Image
              source={{ uri: business.cover_image_url }}
              style={styles.heroImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
              {business.logo_url ? (
                <Image
                  source={{ uri: business.logo_url }}
                  style={styles.heroLogo}
                  contentFit="contain"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={[styles.heroLogoText, { color: colors.textPrimary }]}>{business.name}</Text>
              )}
            </View>
          )}

          {/* Back button */}
          <View style={styles.headerAbsolute}>
            <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.background }]}>
              <ArrowLeftIcon size={24} color={colors.tabIconActive} />
            </Pressable>
          </View>

          {/* Status pill */}
          {openStatus && (
            <View style={[
              styles.statusPill,
              { backgroundColor: openStatus.isOpen ? colors.successBackground : colors.errorBackground },
            ]}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: openStatus.isOpen ? colors.success : colors.error }}>
                {openStatus.isOpen ? 'Geöffnet' : 'Geschlossen'}
              </Text>
            </View>
          )}

          {/* Logo overlay */}
          {business.logo_url && business.cover_image_url && (
            <View style={[styles.logoOverlay, { borderColor: colors.background }]}>
              <Image
                source={{ uri: business.logo_url }}
                style={styles.logoOverlayImage}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={[styles.contentContainer, { backgroundColor: colors.background }]}>
          {/* Name — offset for logo overlap */}
          <Text style={[styles.title, { color: colors.textPrimary, marginLeft: business.logo_url && business.cover_image_url ? 88 : 0 }]}>{business.name}</Text>

          {/* Category badge */}
          <View style={[styles.categoryBadge, { backgroundColor: `${colors.primary}20` }]}>
            <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>{categoryLabel}</Text>
          </View>

          {/* Description — above info cards */}
          {business.description && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über uns</Text>
              <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>{business.description}</Text>
            </View>
          )}

          {/* Info Cards */}
          <View style={styles.infoCards}>
            {business.address && (
              <Pressable
                style={({ pressed }) => [styles.infoCard, { backgroundColor: colors.card, borderColor: colors.borderSecondary }, pressed && { opacity: 0.8 }]}
                onPress={handleDirections}
              >
                <View style={[styles.iconContainer, { backgroundColor: colors.card, borderColor: colors.borderSecondary }]}>
                  <LocationSmallIcon size={24} color={colors.textPrimary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Adresse</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{business.address}</Text>
                </View>
              </Pressable>
            )}

            {business.phone && (
              <Pressable
                style={({ pressed }) => [styles.infoCard, { backgroundColor: colors.card, borderColor: colors.borderSecondary }, pressed && { opacity: 0.8 }]}
                onPress={handleCall}
              >
                <View style={[styles.iconContainer, { backgroundColor: colors.card, borderColor: colors.borderSecondary }]}>
                  <CallIcon size={24} color={colors.textPrimary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Telefon</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{business.phone}</Text>
                </View>
              </Pressable>
            )}

            {business.email && (
              <Pressable
                style={({ pressed }) => [styles.infoCard, { backgroundColor: colors.card, borderColor: colors.borderSecondary }, pressed && { opacity: 0.8 }]}
                onPress={() => Linking.openURL(`mailto:${business.email}`)}
              >
                <View style={[styles.iconContainer, { backgroundColor: colors.card, borderColor: colors.borderSecondary }]}>
                  <MailIcon size={24} color={colors.textPrimary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>E-Mail</Text>
                  <Text style={[styles.infoValue, { color: colors.primary }]}>{business.email}</Text>
                </View>
              </Pressable>
            )}

            {business.website_url && (
              <Pressable
                style={({ pressed }) => [styles.infoCard, { backgroundColor: colors.card, borderColor: colors.borderSecondary }, pressed && { opacity: 0.8 }]}
                onPress={() => Linking.openURL(business.website_url!)}
              >
                <View style={[styles.iconContainer, { backgroundColor: colors.card, borderColor: colors.borderSecondary }]}>
                  <ShareIcon size={24} color={colors.textPrimary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Webseite</Text>
                  <Text style={[styles.infoValue, { color: colors.primary }]} numberOfLines={1}>{business.website_url}</Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Opening Hours */}
          {business.opening_hours && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Öffnungszeiten</Text>
              <View style={[styles.hoursCard, { backgroundColor: colors.surface }]}>
                {DAY_LABELS.map(({ key, label }) => {
                  const dayHours = (business.opening_hours as OpeningHours)?.[key];
                  const isToday = key === currentDay;
                  return (
                    <View
                      key={key}
                      style={[
                        styles.hoursRow,
                        isToday && { backgroundColor: `${colors.primary}10`, borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
                      ]}
                    >
                      <Text style={[styles.dayLabel, { color: isToday ? colors.primary : colors.textPrimary, fontFamily: isToday ? 'Inter-SemiBold' : 'Inter-Medium' }]}>
                        {label}
                      </Text>
                      <Text style={[styles.hoursValue, { color: isToday ? colors.primary : colors.textSecondary }]}>
                        {dayHours && !dayHours.closed ? `${dayHours.open} – ${dayHours.close}` : 'Geschlossen'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Deals */}
          {deals.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Aktuelle Angebote</Text>
              <FlatList
                horizontal
                data={deals}
                renderItem={({ item }) => <BusinessDealCard deal={item as any} compact />}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dealsList}
                scrollEnabled={deals.length > 1}
              />
            </View>
          )}

          {/* Gallery */}
          {business.gallery_images && business.gallery_images.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Galerie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryList}>
                {business.gallery_images.map((url, index) => (
                  <Image
                    key={index}
                    source={{ uri: url }}
                    style={[styles.galleryImage, { backgroundColor: colors.cardPlaceholder }]}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Owner Buttons */}
          {isOwner && (
            <View style={styles.ownerSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Verwaltung</Text>
              <View style={styles.ownerButtons}>
                <Pressable
                  style={({ pressed }) => [styles.ownerButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/business/edit/${business.slug}` as any)}
                >
                  <Text style={[styles.ownerButtonText, { color: colors.textPrimary }]}>Bearbeiten</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.ownerButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/business/analytics/${business.slug}` as any)}
                >
                  <Text style={[styles.ownerButtonText, { color: colors.textPrimary }]}>Statistiken</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            {business.phone && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
                onPress={handleCall}
              >
                <CallIcon size={18} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Anrufen</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
              onPress={handleShare}
            >
              <ShareIcon size={18} color={colors.textPrimary} />
              <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Teilen</Text>
            </Pressable>
            {business.address && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
                onPress={handleDirections}
              >
                <LocationSmallIcon size={18} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Route</Text>
              </Pressable>
            )}
          </View>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter',
  },
  // Hero
  heroContainer: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
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
  heroLogo: {
    width: 180,
    height: 80,
  },
  heroLogoText: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
  },
  headerAbsolute: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  statusPill: {
    position: 'absolute',
    top: 60,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
  },
  logoOverlay: {
    position: 'absolute',
    bottom: -32,
    left: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    overflow: 'hidden',
    zIndex: 10,
  },
  logoOverlayImage: {
    width: '100%',
    height: '100%',
  },
  // Content Container
  contentContainer: {
    padding: 24,
    paddingTop: 16,
    minHeight: 600,
  },
  // Title
  title: {
    fontSize: 26,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
    marginTop: 4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 24,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  // Info Cards
  infoCards: {
    gap: 12,
    marginBottom: 24,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCardContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  // Section
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 16,
    fontFamily: 'Inter',
    lineHeight: 22,
    opacity: 0.85,
  },
  // Opening Hours
  hoursCard: {
    borderRadius: 12,
    padding: 16,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dayLabel: {
    fontSize: 14,
  },
  hoursValue: {
    fontSize: 14,
    fontFamily: 'Inter',
  },
  // Deals
  dealsList: {
    gap: 12,
  },
  // Gallery
  galleryList: {
    gap: 12,
  },
  galleryImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  // Owner
  ownerSection: {
    marginBottom: 24,
  },
  ownerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  ownerButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  ownerButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
