import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { fetchDealById, incrementDealViews } from '@/lib/supabase-deals';
import MeckyNotFound from '@/components/MeckyNotFound';
import { MarketplaceDetailSkeleton } from '@/components/SkeletonLoader';
import ImageZoomModal from '@/components/ImageZoomModal';
import { DEAL_TYPE_LABELS, BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import { ArrowLeftIcon, CalendarIcon } from '@/components/Icons';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import StarIcon from '@/assets/icons/star.svg';
import type { BusinessDealRecord, BusinessRecord } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = 400;

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return date;
  }
}

export default function DealDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [deal, setDeal] = useState<BusinessDealRecord | null>(null);
  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadDeal();
  }, [id]);

  const loadDeal = async () => {
    try {
      setLoading(true);
      const data = await fetchDealById(id!);
      setDeal(data);

      incrementDealViews(id!);

      if (data?.business_id) {
        const { data: bizData } = await (await import('@/lib/supabase')).supabase
          .from('businesses')
          .select('*')
          .eq('id', data.business_id)
          .single();
        if (bizData) setBusiness(bizData as BusinessRecord);
      }
    } catch (error) {
      console.error('Error loading deal:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <MarketplaceDetailSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!deal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.headerAbsolute}>
          <Pressable onPress={goBack} style={[styles.backButton, { backgroundColor: colors.background }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
        </View>
        <MeckyNotFound title="Angebot nicht gefunden" />
      </SafeAreaView>
    );
  }

  const images = (deal.media_urls && deal.media_urls.length > 0
    ? deal.media_urls
    : deal.image_url
      ? [deal.image_url]
      : []
  ).filter(Boolean);

  const dealTypeLabel = DEAL_TYPE_LABELS[deal.deal_type] || deal.deal_type;

  // Only an approved/published business resolves on the /business/[slug] page,
  // so only treat it as a navigable card when it's actually viewable.
  const businessViewable = !!business && business.status === 'published';

  const metaParts: string[] = [];
  if (typeof deal.views_count === 'number') metaParts.push(`${deal.views_count} Aufrufe`);

  let validity = '';
  if (deal.start_date && deal.end_date) validity = `${formatDate(deal.start_date)} – ${formatDate(deal.end_date)}`;
  else if (deal.start_date) validity = `Ab ${formatDate(deal.start_date)}`;
  else if (deal.end_date) validity = `Bis ${formatDate(deal.end_date)}`;

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
                <Pressable
                  key={index}
                  onPress={() => {
                    setActiveImageIndex(index);
                    setLightboxOpen(true);
                  }}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Bild vergrößern"
                >
                  <Image
                    source={{ uri }}
                    style={styles.heroImage}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
              <Text style={styles.placeholderEmoji}>🏷️</Text>
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
                    { backgroundColor: index === activeImageIndex ? '#ffffff' : 'rgba(255,255,255,0.5)' },
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

          {/* Boosted star badge */}
          {deal.is_boosted && (
            <View style={[styles.boostedBadge, { backgroundColor: '#FFA500' }]}>
              <StarIcon width={16} height={16} color="#fff" />
            </View>
          )}

          {/* Value tag — always white bg + black text for consistent contrast */}
          {deal.deal_value && (
            <View style={[styles.priceBadge, { backgroundColor: '#FFFFFF' }]}>
              <Text style={[styles.priceBadgeText, { color: '#000000' }]}>{deal.deal_value}</Text>
            </View>
          )}
        </View>

        {/* Fullscreen image lightbox */}
        <ImageZoomModal
          visible={lightboxOpen}
          images={images}
          imageUrl={images[activeImageIndex]}
          onClose={() => setLightboxOpen(false)}
        />

        {/* Content overlay */}
        <View style={[styles.contentOverlay, { backgroundColor: colors.background }]}>
          {/* Type badge */}
          <View style={[styles.typeBadge, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.typeBadgeText, { color: colors.textSecondary }]}>{dealTypeLabel}</Text>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{deal.title}</Text>

          {/* Meta line */}
          {metaParts.length > 0 && (
            <Text style={[styles.metaLine, { color: colors.textSecondary }]}>{metaParts.join(' • ')}</Text>
          )}

          {/* Business / org row */}
          {business && (
            <Pressable
              style={({ pressed }) => [styles.sellerRow, pressed && businessViewable && { opacity: 0.6 }]}
              onPress={() => {
                if (businessViewable) router.push(`/business/${business.slug}` as any);
              }}
              disabled={!businessViewable}
              accessibilityRole="button"
              accessibilityLabel={`Profil von ${business.name} öffnen`}
            >
              <View style={styles.sellerInfo}>
                {business.logo_url ? (
                  <Image source={{ uri: business.logo_url }} style={styles.sellerLogo} contentFit="cover" />
                ) : (
                  <View style={[styles.sellerLogo, styles.sellerLogoFallback, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.sellerLogoInitial, { color: colors.textSecondary }]}>
                      {(business.name[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sellerName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {business.name}
                  </Text>
                  <Text style={[styles.sellerCategory, { color: colors.textSecondary }]} numberOfLines={1}>
                    {BUSINESS_CATEGORY_LABELS[business.category] || 'Unternehmen'}
                  </Text>
                </View>
              </View>
              {businessViewable && (
                <ChevronLeftIcon
                  width={20}
                  height={20}
                  color={colors.textTertiary}
                  style={{ transform: [{ rotate: '180deg' }] }}
                />
              )}
            </Pressable>
          )}

          {/* Description */}
          {deal.description && (
            <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>{deal.description}</Text>
          )}

          {/* Validity info card */}
          {validity ? (
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.borderSecondary }]}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card, borderColor: colors.borderSecondary }]}>
                <CalendarIcon size={22} color={colors.textPrimary} />
              </View>
              <View style={styles.infoCardContent}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Gültig</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{validity}</Text>
              </View>
            </View>
          ) : null}

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
  boostedBadge: {
    position: 'absolute',
    top: 64,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  priceBadge: {
    position: 'absolute',
    bottom: 60,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  priceBadgeText: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  // Content overlay
  contentOverlay: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    padding: 24,
    paddingTop: 28,
    minHeight: 500,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  typeBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
  },
  metaLine: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
  },
  // Business / seller row
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
  sellerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  sellerLogoFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerLogoInitial: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  sellerName: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  sellerCategory: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  // Description
  descriptionText: {
    fontSize: 16,
    fontFamily: 'Inter',
    lineHeight: 22,
    marginBottom: 24,
  },
  // Info card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 12,
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
});
