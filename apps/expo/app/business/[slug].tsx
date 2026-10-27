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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { isStablecoinPaymentsEnabled } from '@/lib/supabase-app-settings';
import { fetchMerchantAccount } from '@/lib/merchant/registry';
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
import ProfileCoverBanner from '@/components/profile/ProfileCoverBanner';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import type { BusinessRecord, BusinessDealRecord, OpeningHours } from '@/lib/types';

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
  // Stablecoin acceptance: the CTA only shows for the owner, only while the
  // pilot gate is open for them, and only until their Konto is live.
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [merchantLive, setMerchantLive] = useState(false);

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

  useEffect(() => {
    if (!account?.address) return;
    let cancelled = false;
    (async () => {
      const [enabled, merchant] = await Promise.all([
        isStablecoinPaymentsEnabled({ walletAddress: account.address }),
        fetchMerchantAccount(account.address),
      ]);
      if (cancelled) return;
      setPaymentsEnabled(enabled);
      setMerchantLive(merchant?.status === 'live');
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.address]);

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

  const contactRows = [
    business.address
      ? { key: 'address', label: 'Adresse', value: business.address, icon: LocationSmallIcon, onPress: handleDirections, link: false }
      : null,
    business.phone
      ? { key: 'phone', label: 'Telefon', value: business.phone, icon: CallIcon, onPress: handleCall, link: false }
      : null,
    business.email
      ? { key: 'email', label: 'E-Mail', value: business.email, icon: MailIcon, onPress: () => Linking.openURL(`mailto:${business.email}`), link: true }
      : null,
    business.website_url
      ? { key: 'website', label: 'Webseite', value: business.website_url, icon: ShareIcon, onPress: () => Linking.openURL(business.website_url!), link: true }
      : null,
  ].filter(Boolean) as {
    key: string;
    label: string;
    value: string;
    icon: typeof CallIcon;
    onPress: () => void;
    link: boolean;
  }[];

  // Same skeleton as the citizen profile (user/[username]): cover banner,
  // overlapping avatar, name + meta, then flat sections at a 16px gutter.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── Cover banner with back chevron + optional edit pill ── */}
        <View style={styles.bannerWrap}>
          <ProfileCoverBanner assetUrl={business.cover_image_url} />
          <Pressable
            onPress={goBack}
            style={[styles.backPill, { backgroundColor: colors.background }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          {isOwner && (
            <Pressable
              onPress={() => router.push(`/business/edit/${business.slug}` as any)}
              style={[styles.editPill, { backgroundColor: colors.background, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Bearbeiten"
            >
              <Text style={[styles.editPillText, { color: colors.textPrimary }]}>Bearbeiten</Text>
            </Pressable>
          )}
        </View>

        {/* ── Logo ── */}
        <View style={styles.identityRow}>
          <UserAvatarWithFrame
            size={AVATAR_SIZE}
            uri={business.logo_url}
            fallbackInitial={business.name.charAt(0).toUpperCase()}
            disabled
          />
        </View>

        {/* ── Name / category + open status / description ── */}
        <View style={styles.header}>
          <Text style={[styles.displayName, { color: colors.textPrimary }]}>{business.name}</Text>

          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>{categoryLabel}</Text>
            {openStatus && (
              <View style={styles.metaItem}>
                <View
                  style={[styles.statusDot, { backgroundColor: openStatus.isOpen ? colors.success : colors.error }]}
                />
                <Text style={[styles.metaText, { color: openStatus.isOpen ? colors.success : colors.error }]}>
                  {openStatus.isOpen ? 'Geöffnet' : 'Geschlossen'}
                </Text>
              </View>
            )}
          </View>

          {business.description ? (
            <Text style={[styles.bio, { color: colors.textPrimary }]}>{business.description}</Text>
          ) : null}

          {/* Quick actions */}
          <View style={styles.actionRow}>
            {business.phone && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                onPress={handleCall}
              >
                <CallIcon size={16} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Anrufen</Text>
              </Pressable>
            )}
            {business.address && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                onPress={handleDirections}
              >
                <LocationSmallIcon size={16} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Route</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              onPress={handleShare}
            >
              <ShareIcon size={16} color={colors.textPrimary} />
              <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Teilen</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Kontakt ── */}
        {contactRows.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kontakt</Text>
            {contactRows.map(({ key, label, value, icon: Icon, onPress, link }) => (
              <Pressable
                key={key}
                onPress={onPress}
                style={({ pressed }) => [styles.contactRow, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${value}`}
              >
                <Icon size={20} color={colors.textSecondary} />
                <View style={styles.contactText}>
                  <Text style={[styles.contactLabel, { color: colors.textTertiary }]}>{label}</Text>
                  <Text
                    style={[styles.contactValue, { color: link ? colors.primary : colors.textPrimary }]}
                    numberOfLines={key === 'website' ? 1 : undefined}
                  >
                    {value}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Öffnungszeiten (flat rows, today highlighted) ── */}
        {business.opening_hours && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Öffnungszeiten</Text>
            {DAY_LABELS.map(({ key, label }) => {
              const dayHours = (business.opening_hours as OpeningHours)?.[key];
              const isToday = key === currentDay;
              return (
                <View key={key} style={styles.hoursRow}>
                  <Text
                    style={[
                      styles.dayLabel,
                      { color: isToday ? colors.primary : colors.textPrimary, fontFamily: isToday ? 'Inter-SemiBold' : 'Inter-Regular' },
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.hoursValue,
                      { color: isToday ? colors.primary : colors.textSecondary, fontFamily: isToday ? 'Inter-SemiBold' : 'Inter-Regular' },
                    ]}
                  >
                    {dayHours && !dayHours.closed ? `${dayHours.open} – ${dayHours.close}` : 'Geschlossen'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Aktuelle Angebote ── */}
        {deals.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Aktuelle Angebote</Text>
            <FlatList
              horizontal
              data={deals}
              renderItem={({ item }) => <BusinessDealCard deal={item as any} compact />}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              style={styles.hScroll}
              contentContainerStyle={styles.hList}
              scrollEnabled={deals.length > 1}
            />
          </View>
        )}

        {/* ── Galerie ── */}
        {business.gallery_images && business.gallery_images.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Galerie</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.hScroll}
              contentContainerStyle={styles.hList}
            >
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

        {/* ── Verwaltung (owner only) ── */}
        {isOwner && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Verwaltung</Text>
            <Pressable
              style={({ pressed }) => [styles.ownerButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(`/business/analytics/${business.slug}` as any)}
            >
              <Text style={[styles.ownerButtonText, { color: colors.textPrimary }]}>Statistiken</Text>
            </Pressable>
            {paymentsEnabled && !merchantLive && (
              <Pressable
                style={({ pressed }) => [styles.paymentsCta, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                onPress={() =>
                  router.push(`/payments/onboarding?entityType=business&entityId=${business.id}` as any)
                }
              >
                <Text style={[styles.paymentsCtaTitle, { color: colors.textPrimary }]}>Stablecoin-Zahlungen annehmen</Text>
                <Text style={[styles.paymentsCtaBody, { color: colors.textSecondary }]}>Digitale Euro annehmen und sofort mit Karte ausgeben.</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 96;

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
  // Loading / not-found back button
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
  },
  scrollContent: {
    paddingBottom: 40,
  },
  // Banner — mirrors user/[username]
  bannerWrap: {
    position: 'relative',
  },
  backPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  editPillText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  identityRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -(AVATAR_SIZE / 2),
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  displayName: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 6,
    columnGap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bio: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  // Sections — same rhythm as ProfileOfferRows
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  contactText: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dayLabel: {
    fontSize: 14,
  },
  hoursValue: {
    fontSize: 14,
  },
  // Horizontal rows bleed past the 16px inset so they scroll edge-to-edge
  hScroll: {
    marginHorizontal: -16,
  },
  hList: {
    gap: 12,
    paddingHorizontal: 16,
  },
  galleryImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  // Owner
  ownerButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  ownerButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  paymentsCta: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
    marginTop: 12,
  },
  paymentsCtaTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  paymentsCtaBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
});
