import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Alert,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import {
  fetchListingById,
  fetchMarketplaceListings,
  deleteListing,
  fetchSellerProfileByWallet,
  trackListingView,
  type SellerProfile,
} from '@/lib/supabase-marketplace';
import MeckyNotFound from '@/components/MeckyNotFound';
import { getAccountRole, canEditListings } from '@/lib/supabase-account-roles';
import { fetchAccountById } from '@/lib/supabase-accounts';
import { MARKETPLACE_CATEGORY_LABELS, PRICE_TYPE_LABELS, CONDITION_LABELS } from '@/lib/map/constants';
import {
  ArrowLeftIcon,
  ChevronRight,
  LocationSmallIcon,
  ShareIcon,
  SparklesIcon,
} from '@/components/Icons';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import GlassIconButton from '@/components/GlassIconButton';
import CollapsingHeroScreen from '@/components/detail/CollapsingHeroScreen';
import DetailBodySkeleton from '@/components/detail/DetailBodySkeleton';
import ImageGalleryModal from '@/components/detail/ImageGalleryModal';
import { fontFamily } from '@/constants/theme';
import ListingCategoryIcon from '@/components/ListingCategoryIcon';
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from '@/constants/listing-categories';
import MarketplaceCard from '@/components/MarketplaceCard';
import type { MarketplaceListingRecord } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

/** Hero takes ~45% of the screen. */
const HERO_RATIO = 0.45;
const AVATAR = 76;
const AVATAR_RING = 4;
const SIDE = 24;
/** Height of the floating bottom bar card. */
const BAR_HEIGHT = 76;
/** Long descriptions collapse under the title until "Mehr anzeigen". */
const DESCRIPTION_CLAMP = 4;

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
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.round(windowHeight * HERO_RATIO);
  const { user } = useUser();
  const { activeAccount } = useAccount();

  const [listing, setListing] = useState<MarketplaceListingRecord | null>(null);
  const [moreListings, setMoreListings] = useState<MarketplaceListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);

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
    if (!listing) return;
    let cancelled = false;

    // Org listing: author + DM target is the org account, not the seller's
    // personal account. Personal listing (account_id null): resolve the
    // seller's personal account by wallet.
    if (listing.account_id) {
      fetchAccountById(listing.account_id).then((acc) => {
        if (cancelled || !acc) return;
        setSeller({ accountId: acc.id, name: acc.name, avatarUrl: acc.avatar_url });
      });
    } else if (listing.seller_wallet_address) {
      fetchSellerProfileByWallet(listing.seller_wallet_address).then((profile) => {
        if (!cancelled) setSeller(profile);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [listing?.account_id, listing?.seller_wallet_address]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [data, allListings] = await Promise.all([
        fetchListingById(id!),
        fetchMarketplaceListings({ limit: 7 }),
      ]);
      setListing(data);
      setMoreListings(allListings.filter((l) => l.id !== id).slice(0, 6));
      if (data?.id) trackListingView(data.id);
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
      listingId: listing.id,
      listingTitle: listing.title,
      listingPrice: String(listing.price),
      listingPriceType: listing.price_type,
    });
    // Org listing → message the org account directly; personal → resolve the
    // seller's wallet to their personal account on the new-message screen.
    if (listing.account_id) params.set('accountId', listing.account_id);
    else params.set('address', listing.seller_wallet_address);
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

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CollapsingHeroScreen
          heroHeight={heroHeight}
          onBack={goBack}
          loading
          backgroundColor={colors.backdrop}
          skeleton={<DetailBodySkeleton centered avatar={AVATAR} />}
        />
      </>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFoundBack}>
          <GlassIconButton onPress={goBack} accessibilityLabel="Zurück">
            <ArrowLeftIcon size={22} color={colors.textPrimary} />
          </GlassIconButton>
        </View>
        <MeckyNotFound title="Anzeige nicht gefunden" />
      </SafeAreaView>
    );
  }

  const images = listing.media_urls || [];
  const isService = listing.listing_type === 'service';
  const categoryDef =
    [...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES].find((c) => c.key === listing.category) || null;
  const categoryIconName = categoryDef?.icon || 'note';
  const categoryLabel =
    categoryDef?.label || MARKETPLACE_CATEGORY_LABELS[listing.category] || listing.category;
  const conditionLabel = listing.condition ? CONDITION_LABELS[listing.condition] : null;
  // Never expose a raw 0x… wallet address in the UI — resolve to the seller's
  // display name, falling back to a neutral placeholder while it loads / when
  // it can't be resolved. See feedback: never show wallet addresses.
  const sellerName = seller?.name || 'Jemand';
  const sellerFirstName = listing.account_id ? sellerName : sellerName.split(' ')[0];
  const sellerInitial = (sellerName[0] || '?').toUpperCase();
  const sellerRole = listing.account_id ? 'Organisation' : 'Privatperson';

  // Hide "Kontaktieren" only when the ACTIVE account is the seller's account
  // (you can't message yourself). A wallet owns several accounts (personal +
  // orgs), so a wallet match would wrongly hide it for org accounts too — from
  // an org you should be able to message your own citizen account.
  const isOwn = !!activeAccount?.id && !!seller?.accountId && activeAccount.id === seller.accountId;

  const isFree = listing.price_type === 'free';
  const priceBase = isFree
    ? 'Gratis'
    : listing.price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const priceLabel = isFree ? priceBase : isService ? `Ab ${priceBase}` : priceBase;
  const priceSub =
    listing.price_type === 'negotiable'
      ? 'Verhandlungsbasis'
      : isFree
        ? isService ? 'Kostenloses Angebot' : 'Zu verschenken'
        : 'Festpreis';

  let createdRelative = '';
  try {
    createdRelative = formatDistanceToNow(new Date(listing.created_at), {
      locale: de,
      addSuffix: true,
    });
  } catch {
    createdRelative = '';
  }
  // "<Kategorie> in <Ort>" and a secondary line with what else is known.
  const metaLine = listing.neighborhood ? `${categoryLabel} in ${listing.neighborhood}` : categoryLabel;
  const subLine = [
    conditionLabel ? `Zustand: ${conditionLabel}` : null,
    createdRelative ? `Eingestellt ${createdRelative}` : null,
    `${listing.views_count} Aufrufe`,
  ]
    .filter(Boolean)
    .join(' · ');
  const longDescription = (listing.description?.length ?? 0) > 180;

  const openSellerProfile = () => {
    // /account/[id] only renders organisations; personal sellers
    // have their profile at /user/[username].
    if (seller?.username) router.push(`/user/${seller.username}` as any);
    else if (seller?.accountId) router.push(`/account/${seller.accountId}` as any);
  };

  // The bottom bar's one primary action.
  const cta = !isOwn
    ? { label: isService ? 'Anfragen' : 'Nachricht senden', onPress: handleContact, a11y: 'Anbieter kontaktieren' }
    : canEdit
      ? { label: 'Bearbeiten', onPress: () => router.push(`/marketplace/edit/${listing.id}` as any), a11y: 'Anzeige bearbeiten' }
      : null;

  const cardShadow: ViewStyle = isDark
    ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }
    : ({ boxShadow: '0px 6px 24px rgba(0,0,0,0.08)' } as ViewStyle);

  const goodToKnow: {
    key: string;
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    destructive?: boolean;
  }[] = [
    listing.neighborhood
      ? { key: 'place', icon: <LocationSmallIcon size={24} color={colors.textPrimary} />, title: 'Ort', subtitle: listing.neighborhood }
      : null,
    { key: 'category', icon: <ListingCategoryIcon name={categoryIconName} size={24} color={colors.textPrimary} />, title: 'Kategorie', subtitle: categoryLabel },
    conditionLabel
      ? { key: 'condition', icon: <SparklesIcon size={24} color={colors.textPrimary} />, title: 'Qualität', subtitle: conditionLabel }
      : null,
    { key: 'price', icon: <Ionicons name="pricetag-outline" size={22} color={colors.textPrimary} />, title: 'Preis', subtitle: `${priceBase} · ${priceSub}` },
    {
      key: 'share',
      icon: <ShareIcon size={22} color={colors.textPrimary} />,
      title: 'Anzeige teilen',
      subtitle: 'Schick sie an Freunde und Nachbarn',
      onPress: handleShare,
    },
    canEdit
      ? {
          key: 'edit',
          icon: <Ionicons name="create-outline" size={22} color={colors.textPrimary} />,
          title: 'Anzeige bearbeiten',
          onPress: () => router.push(`/marketplace/edit/${listing.id}` as any),
        }
      : null,
    canEdit
      ? {
          key: 'delete',
          icon: <Ionicons name="trash-outline" size={22} color={colors.error} />,
          title: 'Anzeige löschen',
          onPress: handleDelete,
          destructive: true,
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);

  const onHeroScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveImageIndex(Math.round(e.nativeEvent.contentOffset.x / windowWidth));
  };

  const bottomBar = (
    <View
      pointerEvents="box-none"
      style={[styles.barWrap, { bottom: Math.max(insets.bottom, 12) + 4 }]}
    >
      <View style={[styles.bar, { backgroundColor: isDark ? colors.sheet : colors.background }, cardShadow, !isDark && styles.barShadow]}>
        <View style={styles.barText}>
          <Text style={[styles.barPrice, { color: colors.textPrimary }]} numberOfLines={1}>
            {priceLabel}
          </Text>
          <Text style={[styles.barSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {priceSub}
          </Text>
        </View>
        {cta ? (
          <Pressable
            onPress={cta.onPress}
            style={({ pressed }) => [styles.barCta, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={cta.a11y}
          >
            <Text style={[styles.barCtaText, { color: colors.onPrimary }]} numberOfLines={1}>
              {cta.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CollapsingHeroScreen
        heroHeight={heroHeight}
        imageUri={images[activeImageIndex] ?? images[0] ?? null}
        backgroundColor={colors.backdrop}
        heroBackgroundColor={colors.cardPlaceholder}
        sheetStyle={styles.sheet}
        title={listing.title}
        onBack={goBack}
        actions={[
          {
            key: 'share',
            accessibilityLabel: 'Anzeige teilen',
            onPress: handleShare,
            renderIcon: (c) => <ShareIcon size={20} color={c} />,
          },
        ]}
        contentContainerStyle={{ paddingBottom: BAR_HEIGHT + Math.max(insets.bottom, 12) + 40 }}
        renderHero={() =>
          images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onHeroScrollEnd}
              scrollEnabled={images.length > 1}
            >
              {images.map((uri, index) => (
                <Pressable
                  key={`${index}-${uri}`}
                  onPress={() => openGallery(index)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Bilder ansehen"
                >
                  <Image
                    source={{ uri }}
                    style={{ width: windowWidth, height: heroHeight }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={index === 0 ? 0 : 150}
                    accessibilityIgnoresInvertColors
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
              <ListingCategoryIcon name={categoryIconName} size={64} color={colors.textTertiary} />
            </View>
          )
        }
        heroOverlay={
          images.length > 1 ? (
            <View style={styles.heroCounter} pointerEvents="none">
              <Text style={styles.heroCounterText}>
                {activeImageIndex + 1} / {images.length}
              </Text>
            </View>
          ) : null
        }
        footer={bottomBar}
        belowSheet={
          <Pressable
            onPress={() => router.push('/feedback' as any)}
            hitSlop={8}
            style={({ pressed }) => [styles.reportLink, pressed && styles.pressed]}
            accessibilityRole="link"
          >
            <Ionicons name="flag-outline" size={16} color={colors.textPrimary} />
            <Text style={[styles.reportText, { color: colors.textPrimary }]}>Problem melden?</Text>
          </Pressable>
        }
      >
        {/* ── Identity: avatar on the sheet edge, centered title block ── */}
        <View style={styles.identity}>
          <Pressable
            onPress={openSellerProfile}
            disabled={!seller?.accountId}
            style={[styles.avatarRing, { backgroundColor: colors.background }]}
            accessibilityRole="button"
            accessibilityLabel={`Profil von ${sellerName} öffnen`}
          >
            <UserAvatarWithFrame size={AVATAR} uri={seller?.avatarUrl ?? null} fallbackInitial={sellerInitial} disabled />
          </Pressable>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{listing.title}</Text>

          {listing.description ? (
            <>
              <Text
                style={[styles.description, { color: colors.textSecondary }]}
                numberOfLines={descExpanded ? undefined : DESCRIPTION_CLAMP}
              >
                {listing.description}
              </Text>
              {longDescription ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.moreLink, { color: colors.textPrimary }]}>
                    {descExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          <Text style={[styles.metaLine, { color: colors.textPrimary }]}>{metaLine}</Text>
          {subLine ? <Text style={[styles.subLine, { color: colors.textSecondary }]}>{subLine}</Text> : null}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Provider ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {isService ? 'Angeboten von' : 'Verkauft von'}
          </Text>
          <Pressable
            onPress={openSellerProfile}
            disabled={!seller?.accountId}
            style={({ pressed }) => [
              styles.providerCard,
              { backgroundColor: isDark ? colors.surface : colors.background },
              cardShadow,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Profil von ${sellerName} öffnen`}
          >
            <UserAvatarWithFrame size={96} uri={seller?.avatarUrl ?? null} fallbackInitial={sellerInitial} disabled />
            <Text style={[styles.providerName, { color: colors.textPrimary }]} numberOfLines={2}>
              {sellerName}
            </Text>
            <Text style={[styles.providerRole, { color: colors.textSecondary }]}>{sellerRole}</Text>
          </Pressable>
          {!isOwn ? (
            <Pressable
              onPress={handleContact}
              style={({ pressed }) => [styles.messageButton, { backgroundColor: colors.surface }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Verkäufer kontaktieren"
            >
              <Text style={[styles.messageButtonText, { color: colors.textPrimary }]} numberOfLines={1}>
                Nachricht an {sellerFirstName}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* ── Portfolio ── */}
        {images.length > 1 ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {isService ? 'Einblicke' : 'Fotos'}
              </Text>
              <View style={styles.grid}>
                {images.slice(0, 6).map((uri, index) => (
                  <Pressable
                    key={`${index}-${uri}`}
                    onPress={() => openGallery(index)}
                    style={({ pressed }) => [
                      styles.gridTile,
                      { width: (windowWidth - SIDE * 2 - 8) / 2, backgroundColor: colors.cardPlaceholder },
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Foto ${index + 1} ansehen`}
                  >
                    <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                    {index === 5 && images.length > 6 ? (
                      <View style={styles.gridMore}>
                        <Text style={styles.gridMoreText}>+{images.length - 6}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {/* ── Gut zu wissen ── */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gut zu wissen</Text>
          {goodToKnow.map((row) => {
            const content = (
              <>
                <View style={styles.rowIcon}>{row.icon}</View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: row.destructive ? colors.error : colors.textPrimary }]}>
                    {row.title}
                  </Text>
                  {row.subtitle ? (
                    <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                      {row.subtitle}
                    </Text>
                  ) : null}
                </View>
                {row.onPress && !row.destructive ? (
                  <ChevronRight size={20} color={colors.textTertiary} strokeWidth={1.5} />
                ) : null}
              </>
            );
            return row.onPress ? (
              <Pressable
                key={row.key}
                onPress={row.onPress}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={row.title}
              >
                {content}
              </Pressable>
            ) : (
              <View key={row.key} style={styles.row}>
                {content}
              </View>
            );
          })}
        </View>

        {/* ── Weitere Anzeigen ── */}
        {moreListings.length > 0 && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.moreSection}>
              <Text style={[styles.sectionTitle, styles.moreTitle, { color: colors.textPrimary }]}>Weitere Anzeigen</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreList}>
                {moreListings.map((item) => (
                  <MarketplaceCard key={item.id} listing={item} compact />
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </CollapsingHeroScreen>

      <ImageGalleryModal
        visible={galleryOpen}
        images={images}
        initialIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pressed: { opacity: 0.7 },
  notFoundBack: { position: 'absolute', top: 60, left: 20, zIndex: 10 },

  // Hero
  heroPlaceholder: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heroCounter: {
    position: 'absolute',
    right: 16,
    bottom: 24 + 16,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heroCounterText: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontFamily: fontFamily.semiBold },

  // Sheet: rounded on all four corners — ends over the grey backdrop.
  sheet: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 8,
  },

  // Identity
  identity: {
    alignItems: 'center',
    paddingHorizontal: SIDE,
  },
  avatarRing: {
    width: AVATAR + AVATAR_RING * 2,
    height: AVATAR + AVATAR_RING * 2,
    borderRadius: (AVATAR + AVATAR_RING * 2) / 2,
    marginTop: -(AVATAR + AVATAR_RING * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 16,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    fontFamily: fontFamily.heading,
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 24,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
  },
  moreLink: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fontFamily.semiBold,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  metaLine: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fontFamily.medium,
    textAlign: 'center',
  },
  subLine: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SIDE,
    marginVertical: 28,
  },

  // Sections
  section: { paddingHorizontal: SIDE },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
    fontFamily: fontFamily.heading,
    marginBottom: 16,
  },

  // Provider
  providerCard: {
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  providerName: {
    marginTop: 14,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.5,
    fontFamily: fontFamily.heading,
    textAlign: 'center',
  },
  providerRole: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fontFamily.regular,
  },
  messageButton: {
    marginTop: 16,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  messageButtonText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fontFamily.semiBold,
  },

  // Portfolio grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridTile: { aspectRatio: 1, borderRadius: 16, overflow: 'hidden' },
  gridMore: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridMoreText: { color: '#FFFFFF', fontSize: 20, fontFamily: fontFamily.semiBold },

  // Gut zu wissen rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
  },
  rowIcon: { width: 28, alignItems: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, lineHeight: 21, fontFamily: fontFamily.semiBold },
  rowSubtitle: { marginTop: 2, fontSize: 15, lineHeight: 20, fontFamily: fontFamily.regular },

  // More listings
  moreSection: { paddingBottom: 16 },
  moreTitle: { paddingHorizontal: SIDE },
  moreList: { paddingHorizontal: SIDE, gap: 12 },

  // Below the sheet
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: 24,
    paddingVertical: 8,
  },
  reportText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fontFamily.semiBold,
    textDecorationLine: 'underline',
  },

  // Floating bottom bar
  barWrap: { position: 'absolute', left: 16, right: 16 },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    paddingRight: 10,
    gap: 12,
  },
  barShadow: { boxShadow: '0px 8px 28px rgba(0,0,0,0.14)' } as ViewStyle,
  barText: { flex: 1 },
  barPrice: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: fontFamily.semiBold,
    textDecorationLine: 'underline',
  },
  barSub: { marginTop: 1, fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
  barCta: {
    height: 56,
    paddingHorizontal: 26,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barCtaText: { fontSize: 16, lineHeight: 20, fontFamily: fontFamily.semiBold },
});
