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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import {
  fetchListingById,
  fetchMarketplaceListings,
  deleteListing,
  fetchSellerProfileByWallet,
  type SellerProfile,
} from '@/lib/supabase-marketplace';
import MeckyNotFound from '@/components/MeckyNotFound';
import { getAccountRole, canEditListings } from '@/lib/supabase-account-roles';
import { MARKETPLACE_CATEGORY_LABELS, PRICE_TYPE_LABELS, CONDITION_LABELS } from '@/lib/map/constants';
import {
  ArrowLeftIcon,
  LocationSmallIcon,
  ShareIcon,
  SparklesIcon,
  MailSmallIcon,
} from '@/components/Icons';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import ListingCategoryIcon from '@/components/ListingCategoryIcon';
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from '@/constants/listing-categories';
import MarketplaceCard from '@/components/MarketplaceCard';
import type { MarketplaceListingRecord } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = 400;

function formatPrice(price: number, priceType: string): string {
  if (priceType === 'free') return 'Gratis';
  const formatted = price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const suffix = PRICE_TYPE_LABELS[priceType] || '';
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export default function ListingDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user } = useUser();

  const [listing, setListing] = useState<MarketplaceListingRecord | null>(null);
  const [moreListings, setMoreListings] = useState<MarketplaceListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [seller, setSeller] = useState<SellerProfile | null>(null);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  useEffect(() => {
    if (!listing || !user?.wallet_address) return;

    const checkPermission = async () => {
      if (listing.account_id) {
        // Org listing: check role in the account
        const role = await getAccountRole(listing.account_id, user.wallet_address);
        setCanEdit(canEditListings(role));
      } else {
        // Personal listing: check if user is the seller
        setCanEdit(listing.seller_wallet_address.toLowerCase() === user.wallet_address.toLowerCase());
      }
    };
    checkPermission();
  }, [listing, user?.wallet_address]);

  useEffect(() => {
    if (!listing?.seller_wallet_address) return;
    let cancelled = false;
    fetchSellerProfileByWallet(listing.seller_wallet_address).then((profile) => {
      if (!cancelled) setSeller(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [listing?.seller_wallet_address]);

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

  const handleDelete = () => {
    if (!listing) return;
    Alert.alert(
      'Anzeige löschen',
      'Möchtest du diese Anzeige wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteListing(listing.id);
              router.back();
            } catch (error: any) {
              Alert.alert('Fehler', error?.message || 'Löschen fehlgeschlagen.');
            }
          },
        },
      ]
    );
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
          <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.background }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
        </View>
        <MeckyNotFound title="Anzeige nicht gefunden" />
      </SafeAreaView>
    );
  }

  const images = listing.media_urls || [];
  const categoryDef =
    [...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES].find((c) => c.key === listing.category) || null;
  const categoryIconName = categoryDef?.icon || 'note';
  const categoryLabel =
    categoryDef?.label || MARKETPLACE_CATEGORY_LABELS[listing.category] || listing.category;
  const conditionLabel = listing.condition ? CONDITION_LABELS[listing.condition] : null;
  const sellerShort = listing.seller_wallet_address
    ? `${listing.seller_wallet_address.slice(0, 6)}...${listing.seller_wallet_address.slice(-4)}`
    : 'Unbekannt';
  const sellerName = seller?.name || sellerShort;

  const isOwn =
    !!user?.wallet_address &&
    listing.seller_wallet_address.toLowerCase() === user.wallet_address.toLowerCase();

  let createdRelative = '';
  try {
    createdRelative = formatDistanceToNow(new Date(listing.created_at), {
      locale: de,
      addSuffix: true,
    });
  } catch {
    createdRelative = '';
  }
  const metaParts = [
    `${listing.views_count} Aufrufe`,
    createdRelative,
  ].filter(Boolean);

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
            <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.background }]}>
              <ArrowLeftIcon size={24} color={colors.tabIconActive} />
            </Pressable>
          </View>
        </View>

        {/* Content overlay */}
        <View style={[styles.contentOverlay, { backgroundColor: colors.background }]}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{listing.title}</Text>

          {/* Meta line */}
          {metaParts.length > 0 && (
            <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
              {metaParts.join(' • ')}
            </Text>
          )}

          {/* Seller row */}
          <View style={styles.sellerRow}>
            <View style={styles.sellerInfo}>
              <UserAvatarWithFrame
                size={44}
                uri={seller?.avatarUrl ?? null}
                fallbackInitial={(sellerName[0] || '?').toUpperCase()}
                disabled
              />
              <Text style={[styles.sellerName, { color: colors.textPrimary }]} numberOfLines={1}>
                {sellerName}
              </Text>
            </View>
            {!isOwn && (
              <Pressable
                style={({ pressed }) => [
                  styles.contactPill,
                  { backgroundColor: colors.surface },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handleContact}
                accessibilityRole="button"
                accessibilityLabel="Verkäufer kontaktieren"
              >
                <MailSmallIcon size={20} color={colors.textPrimary} />
                <Text style={[styles.contactPillText, { color: colors.textPrimary }]}>Kontaktieren</Text>
              </Pressable>
            )}
          </View>

          {/* Price */}
          <Text style={[styles.priceLarge, { color: colors.textPrimary }]}>
            {formatPrice(listing.price, listing.price_type)}
          </Text>

          {/* Description */}
          {listing.description && (
            <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>{listing.description}</Text>
          )}

          {/* Info Cards */}
          <View style={styles.infoCards}>
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

            {/* Condition / quality card */}
            {conditionLabel && (
              <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
                  <SparklesIcon size={20} color={colors.primary} />
                </View>
                <View style={styles.infoCardContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Qualität</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{conditionLabel}</Text>
                </View>
              </View>
            )}

            {/* Category card (dynamic icon) */}
            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}20` }]}>
                <ListingCategoryIcon name={categoryIconName} size={20} color={colors.primary} />
              </View>
              <View style={styles.infoCardContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Kategorie</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{categoryLabel}</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
              onPress={handleShare}
            >
              <ShareIcon size={18} color={colors.textPrimary} />
              <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Teilen</Text>
            </Pressable>
            {canEdit && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
                onPress={() => router.push(`/marketplace/edit/${listing.id}` as any)}
              >
                <Text style={[styles.actionButtonText, { color: colors.primary }]}>Bearbeiten</Text>
              </Pressable>
            )}
          </View>

          {/* Delete button for owners */}
          {canEdit && (
            <Pressable
              style={[styles.deleteButton, { borderColor: '#EF4444' }]}
              onPress={handleDelete}
            >
              <Text style={styles.deleteButtonText}>Anzeige löschen</Text>
            </Pressable>
          )}

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
  // Title
  title: {
    fontSize: 26,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
  },
  metaLine: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
  },
  // Seller row
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  sellerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellerName: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  contactPillText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  priceLarge: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
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
    marginBottom: 24,
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
  deleteButton: {
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#EF4444',
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
