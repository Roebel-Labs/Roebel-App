import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { fetchListingById, fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { MARKETPLACE_CATEGORY_LABELS, PRICE_TYPE_LABELS, CONDITION_LABELS } from '@/lib/map/constants';
import {
  ArrowLeftIcon,
  LocationSmallIcon,
  CalendarIcon,
  UserIcon,
  ShareIcon,
  StarIconComponent,
  MarketsIcon,
  ClockIcon,
  MailIcon,
} from '@/components/Icons';
import MarketplaceCard from '@/components/MarketplaceCard';
import type { MarketplaceListingRecord } from '@/lib/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = 400;

function formatPrice(price: number, priceType: string): string {
  if (priceType === 'free') return 'Gratis';
  const formatted = price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const suffix = PRICE_TYPE_LABELS[priceType] || '';
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd. MMMM yyyy', { locale: de });
  } catch {
    return dateStr;
  }
}

export default function ListingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [listing, setListing] = useState<MarketplaceListingRecord | null>(null);
  const [moreListings, setMoreListings] = useState<MarketplaceListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [data, allListings] = await Promise.all([
        fetchListingById(id!),
        fetchMarketplaceListings({ limit: 7 }),
      ]);
      setListing(data);
      setMoreListings(allListings.filter((l) => l.id !== id).slice(0, 6));
    } catch (error) {
      console.error('Error loading listing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!listing) return;
    try {
      await Share.share({ message: `${listing.title} - ${formatPrice(listing.price, listing.price_type)}\nhttps://www.roebel.app/app/marktplatz/${listing.id}` });
    } catch {}
  };

  const handleContact = () => {
    if (!listing) return;
    const params = new URLSearchParams({
      address: listing.seller_wallet_address,
      listingId: listing.id,
      listingTitle: listing.title,
      listingPrice: String(listing.price),
      listingPriceType: listing.price_type,
    });
    if (listing.media_urls?.[0]) params.set('listingImage', listing.media_urls[0]);
    if (listing.condition) params.set('listingCondition', listing.condition);
    router.push(`/messages/new?${params.toString()}` as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.headerAbsolute}>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.background }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Anzeige nicht gefunden</Text>
        </View>
      </SafeAreaView>
    );
  }

  const images = listing.media_urls || [];
  const categoryLabel = MARKETPLACE_CATEGORY_LABELS[listing.category] || listing.category;
  const conditionLabel = listing.condition ? CONDITION_LABELS[listing.condition] : null;
  const priceTypeLabel = PRICE_TYPE_LABELS[listing.price_type] || '';
  const sellerShort = listing.seller_wallet_address
    ? `${listing.seller_wallet_address.slice(0, 6)}...${listing.seller_wallet_address.slice(-4)}`
    : 'Unbekannt';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveImageIndex(index);
              }}
            >
              {images.map((uri, index) => (
                <Image
                  key={index}
                  source={{ uri }}
                  style={styles.heroImage}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
              <Text style={styles.placeholderEmoji}>🛍️</Text>
            </View>
          )}

          {/* Pagination dots */}
          {images.length > 1 && (
            <View style={styles.paginationDots}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: index === activeImageIndex ? '#ffffff' : 'rgba(255,255,255,0.5)',
                    },
                  ]}
                />
              ))}
            </View>
          )}

          {/* Back button */}
          <View style={styles.headerAbsolute}>
            <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.background }]}>
              <ArrowLeftIcon size={24} color={colors.tabIconActive} />
            </Pressable>
          </View>

          {/* Price badge */}
          <View style={[styles.priceBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.priceBadgeText}>{formatPrice(listing.price, listing.price_type)}</Text>
          </View>
        </View>

        {/* Content overlay */}
        <View style={[styles.contentOverlay, { backgroundColor: colors.background }]}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{listing.title}</Text>

          {/* Badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: `${colors.primary}20` }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{categoryLabel}</Text>
            </View>
            {conditionLabel && (
              <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{conditionLabel}</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                {listing.listing_type === 'product' ? 'Produkt' : 'Dienstleistung'}
              </Text>
            </View>
          </View>

          {/* Info Cards */}
          <View style={styles.infoCards}>
            {/* Price card */}
            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
                <MarketsIcon size={20} color={colors.primary} />
              </View>
              <View style={styles.infoCardContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Preis</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                  {formatPrice(listing.price, listing.price_type)}
                </Text>
                {priceTypeLabel ? (
                  <Text style={[styles.infoSubvalue, { color: colors.textSecondary }]}>{priceTypeLabel}</Text>
                ) : null}
              </View>
            </View>

            {/* Condition card */}
            {conditionLabel && (
              <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
                  <StarIconComponent size={20} color={colors.primary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Zustand</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{conditionLabel}</Text>
                </View>
              </View>
            )}

            {/* Location card */}
            {listing.neighborhood && (
              <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
                  <LocationSmallIcon size={20} color={colors.primary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Ort</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{listing.neighborhood}</Text>
                </View>
              </View>
            )}

            {/* Views card */}
            {listing.views_count > 0 && (
              <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
                  <ClockIcon size={20} color={colors.primary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Aufrufe</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{listing.views_count}</Text>
                </View>
              </View>
            )}

            {/* Created card */}
            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
                <CalendarIcon size={20} color={colors.primary} />
              </View>
              <View style={styles.infoCardContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Eingestellt am</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{formatDate(listing.created_at)}</Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {listing.description && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Beschreibung</Text>
              <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>{listing.description}</Text>
            </View>
          )}

          {/* Seller */}
          <View style={[styles.sellerCard, { backgroundColor: colors.surface }]}>
            <View style={styles.sellerHeader}>
              <View style={[styles.sellerIconContainer, { backgroundColor: `${colors.primary}20` }]}>
                <UserIcon size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.sellerLabel, { color: colors.textTertiary }]}>Verkäufer</Text>
                <Text style={[styles.sellerAddress, { color: colors.textPrimary }]}>{sellerShort}</Text>
              </View>
            </View>
          </View>

          {/* Contact CTA */}
          <Pressable
            style={({ pressed }) => [styles.contactButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
            onPress={handleContact}
          >
            <MailIcon size={20} color="#ffffff" />
            <Text style={styles.contactButtonText}>Verkäufer kontaktieren</Text>
          </Pressable>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
              onPress={handleShare}
            >
              <ShareIcon size={18} color={colors.textPrimary} />
              <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Teilen</Text>
            </Pressable>
          </View>

          {/* More Listings */}
          {moreListings.length > 0 && (
            <View style={styles.moreSection}>
              <Text style={[styles.moreSectionTitle, { color: colors.textPrimary }]}>Weitere Anzeigen</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreList}>
                {moreListings.map((item) => (
                  <MarketplaceCard key={item.id} listing={item} compact />
                ))}
              </ScrollView>
            </View>
          )}

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
  emptyText: {
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
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderEmoji: {
    fontSize: 64,
  },
  paginationDots: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  priceBadge: {
    position: 'absolute',
    bottom: 44,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    zIndex: 10,
  },
  priceBadgeText: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  // Content Overlay
  contentOverlay: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    padding: 24,
    paddingTop: 28,
    minHeight: 600,
  },
  // Title & Badges
  title: {
    fontSize: 26,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
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
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  infoSubvalue: {
    fontSize: 13,
    fontFamily: 'Inter',
    marginTop: 2,
  },
  // Section
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 16,
    fontFamily: 'Inter',
    lineHeight: 22,
    opacity: 0.85,
  },
  // Seller
  sellerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  sellerAddress: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  // Contact CTA
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  contactButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
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
  // More Listings
  moreSection: {
    marginTop: 16,
    marginHorizontal: -24,
  },
  moreSectionTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  moreList: {
    paddingHorizontal: 24,
    gap: 12,
  },
});
