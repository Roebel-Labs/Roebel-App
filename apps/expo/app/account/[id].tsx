import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import UserIcon from '@/assets/icons/user.svg';
import PencilEditIcon from '@/assets/icons/pencil-edit-01.svg';
import AvatarStack from '@/components/AvatarStack';
import MapboxMapView from '@/components/map/MapboxMapView';
import ProfileTabs from '@/components/profile/ProfileTabs';
import AccountPostsList from '@/components/profile/AccountPostsList';
import { Skeleton } from '@/components/SkeletonLoader';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import { fetchAccountById } from '@/lib/supabase-accounts';
import { fetchMembersWithProfiles } from '@/lib/supabase-member-management';
import { fetchAccountPosts, fetchEventsByAccount } from '@/lib/supabase-posts';
import { fetchOrgListings } from '@/lib/supabase-marketplace';
import { listForAccount as listBlogForAccount } from '@/lib/supabase-blog-articles';
import { fetchDealsByBusiness } from '@/lib/supabase-deals';
import { resolveOrgLocation, type OrgLocation } from '@/lib/org-location';
import { isRestaurantOpen } from '@/lib/utils';
import type {
  Account,
  MemberWithProfile,
  OrgSubType,
  OpeningHours,
  EventRecord,
  BlogArticle,
  MarketplaceListingRecord,
  BusinessDealRecord,
} from '@/lib/types';
import type { PostRecord } from '@/lib/types/feed';

const AVATAR_SIZE = 120;

type TabKey = 'info' | 'posts';

const DAY_LABELS: { key: keyof OpeningHours; label: string }[] = [
  { key: 'monday', label: 'Mo' },
  { key: 'tuesday', label: 'Di' },
  { key: 'wednesday', label: 'Mi' },
  { key: 'thursday', label: 'Do' },
  { key: 'friday', label: 'Fr' },
  { key: 'saturday', label: 'Sa' },
  { key: 'sunday', label: 'So' },
];

const SUB_TYPE_LABELS: Partial<Record<OrgSubType, { emoji: string; label: string }>> = {
  verein: { emoji: '🏛️', label: 'Verein' },
  restaurant: { emoji: '🍽️', label: 'Restaurant' },
  partei: { emoji: '🎗️', label: 'Partei' },
  fraktion: { emoji: '📋', label: 'Fraktion' },
  unternehmen: { emoji: '🏢', label: 'Unternehmen' },
  journalist: { emoji: '📰', label: 'Journalismus' },
};

function subTypeLabel(subType: OrgSubType | null): { emoji: string; label: string } | null {
  if (!subType) return null;
  return SUB_TYPE_LABELS[subType] ?? null;
}

function formatEventDate(date: string | null | undefined, time: string | null): string {
  if (!date || typeof date !== 'string') return '';
  try {
    const d = new Date(date + 'T' + (time ?? '00:00:00'));
    if (Number.isNaN(d.getTime())) return date;
    const day = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    if (!time) return day;
    const hhmm = String(time).slice(0, 5);
    return `${day} · ${hhmm}`;
  } catch {
    return date;
  }
}

function formatPrice(price: number | null | undefined, priceType: string): string {
  if (priceType === 'free') return 'Gratis';
  if (typeof price !== 'number' || !Number.isFinite(price)) return '';
  const formatted = price.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${formatted} €${priceType === 'negotiable' ? ' VB' : ''}`;
}

export default function PublicAccountScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { switchAccount } = useAccount();
  const { user } = useUser();

  const [account, setAccount] = useState<Account | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [blogArticles, setBlogArticles] = useState<BlogArticle[]>([]);
  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);
  const [deals, setDeals] = useState<BusinessDealRecord[]>([]);
  const [orgLocation, setOrgLocation] = useState<OrgLocation | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [acc, mem] = await Promise.all([
          fetchAccountById(id),
          fetchMembersWithProfiles(id),
        ]);
        if (cancelled) return;
        setAccount(acc);
        setMembers(mem);
      } catch (err) {
        console.error('Error loading account:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!account || account.account_type !== 'organisation') return;
    let cancelled = false;
    (async () => {
      try {
        const [postsRes, eventsRes, blogRes, listingsRes, location] = await Promise.all([
          fetchAccountPosts(account.id, { pageSize: 12 }).catch(() => ({ data: [] as PostRecord[], hasMore: false })),
          fetchEventsByAccount(account.id, 12).catch(() => [] as EventRecord[]),
          listBlogForAccount(account.id).catch(() => [] as BlogArticle[]),
          fetchOrgListings(account.id).catch(() => [] as MarketplaceListingRecord[]),
          resolveOrgLocation(account, members).catch(() => null),
        ]);
        if (cancelled) return;
        setPosts(postsRes.data);
        setEvents(eventsRes as EventRecord[]);
        setBlogArticles(blogRes.filter((a) => a.status === 'published'));
        setListings(listingsRes.filter((l) => l.status === 'active'));
        setOrgLocation(location);

        if (location?.entityType === 'business' && location.entityId) {
          const dealsList = await fetchDealsByBusiness(location.entityId).catch(() => []);
          if (!cancelled) {
            setDeals(dealsList.filter((d) => d.is_active && d.status === 'active'));
          }
        }
      } catch (err) {
        console.error('Error loading org content:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, members]);

  const products = useMemo(
    () =>
      listings.filter(
        (l) => l && l.id && typeof l.title === 'string' && l.listing_type === 'product'
      ),
    [listings]
  );
  const services = useMemo(
    () =>
      listings.filter(
        (l) => l && l.id && typeof l.title === 'string' && l.listing_type === 'service'
      ),
    [listings]
  );

  const myWallet = user?.wallet_address?.toLowerCase() ?? null;
  const myRole = useMemo(
    () =>
      myWallet
        ? members.find(
            (m) =>
              typeof m?.wallet_address === 'string' &&
              m.wallet_address.toLowerCase() === myWallet
          )?.role ?? null
        : null,
    [members, myWallet]
  );
  const canEdit = myRole === 'owner' || myRole === 'admin';

  const safeEvents = useMemo(
    () => events.filter((e) => e && e.id && typeof e.title === 'string'),
    [events]
  );
  const safeBlog = useMemo(
    () => blogArticles.filter((a) => a && a.id && typeof a.title === 'string'),
    [blogArticles]
  );
  const safeDeals = useMemo(
    () => deals.filter((d) => d && d.id && typeof d.title === 'string'),
    [deals]
  );

  if (loading) {
    return <AccountPageSkeleton onBack={goBack} />;
  }

  if (!account || account.account_type !== 'organisation') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profil</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Nicht verfügbar</Text>
        </View>
      </SafeAreaView>
    );
  }

  const subType = subTypeLabel(account.sub_type);
  const memberAvatars = members.slice(0, 3).map((m) => ({
    avatar_url: m.user?.profile_picture_url ?? null,
    username: m.user?.username ?? null,
  }));

  const showExternBadge = account.is_extern && account.extern_status !== 'approved';

  const openingHours: OpeningHours | null =
    orgLocation?.restaurant?.opening_hours ??
    orgLocation?.business?.opening_hours ??
    null;
  const openStatus = openingHours ? isRestaurantOpen(openingHours) : null;
  const supportsOpeningHours =
    account.sub_type === 'restaurant' || account.sub_type === 'unternehmen';

  const goToOwnerScreen = async (pathname: '/org/settings' | '/org/opening-hours') => {
    try {
      await switchAccount(account.id);
    } catch (err) {
      console.error('switchAccount failed:', err);
    }
    router.push(pathname as any);
  };

  const openMap = () => {
    if (!orgLocation) return;
    router.push({
      pathname: '/location',
      params: {
        focusEntityType: orgLocation.entityType,
        focusEntityId: orgLocation.entityId,
        filterOnly: 'orgs',
      },
    } as any);
  };

  const handleContactPress = () => {
    if (!account.contact_email) return;
    Linking.openURL(`mailto:${account.contact_email}`).catch(() => undefined);
  };

  const hasValidCoords =
    !!orgLocation &&
    Number.isFinite(orgLocation.lat) &&
    Number.isFinite(orgLocation.lon);

  const mapGeoJSON = orgLocation && hasValidCoords
    ? {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            id: `${orgLocation.entityType}-${orgLocation.entityId}`,
            geometry: {
              type: 'Point' as const,
              coordinates: [orgLocation.lon, orgLocation.lat] as [number, number],
            },
            properties: {
              id: orgLocation.entityId,
              entityType: orgLocation.entityType,
              title: account.name,
              subtitle: orgLocation.address ?? '',
              category: orgLocation.entityType,
              image_url: null,
              date: null,
              slug: orgLocation.slug,
              poi_type: null,
              poi_status: null,
              maki: orgLocation.entityType === 'restaurant' ? 'restaurant' : 'shop',
            },
          },
        ],
      }
    : null;

  const renderInfoTab = () => (
    <>
      {/* Contact */}
      {account.contact_email ? (
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kontakt</Text>
          <Pressable onPress={handleContactPress} accessibilityRole="link">
            <Text style={[styles.linkText, { color: colors.primary }]}>{account.contact_email}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Members */}
      {members.length > 0 && (
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mitglieder</Text>
          <View style={styles.membersRow}>
            <AvatarStack
              users={memberAvatars}
              totalCount={members.length}
              maxVisible={3}
              size="large"
            />
            <Text style={[styles.membersCount, { color: colors.textSecondary }]}>
              {members.length} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}
            </Text>
          </View>
        </View>
      )}

      {/* Öffnungszeiten — promoted above all other content sections */}
      {supportsOpeningHours && (openingHours || canEdit) ? (
        <InlineErrorBoundary label="org-opening-hours">
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Öffnungszeiten</Text>
            <View style={styles.sectionHeaderRight}>
              {openStatus ? (
                <Text
                  style={[
                    styles.openStatus,
                    { color: openStatus.isOpen ? colors.success : colors.textTertiary },
                  ]}
                >
                  {openStatus.isOpen
                    ? `Offen${openStatus.closesAt ? ` · bis ${openStatus.closesAt}` : ''}`
                    : openStatus.opensAt
                      ? `Geschlossen · öffnet ${openStatus.opensAt}`
                      : 'Geschlossen'}
                </Text>
              ) : null}
              {canEdit ? (
                <Pressable
                  onPress={() => goToOwnerScreen('/org/opening-hours')}
                  style={styles.iconButton}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Öffnungszeiten bearbeiten"
                >
                  <PencilEditIcon width={18} height={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>
          {openingHours ? (
            <View style={styles.hoursList}>
              {DAY_LABELS.map(({ key, label }) => {
                const day = openingHours[key];
                const closed = !day || day.closed;
                return (
                  <View key={key} style={styles.hoursRow}>
                    <Text style={[styles.hoursDay, { color: colors.textSecondary }]}>{label}</Text>
                    <Text style={[styles.hoursTime, { color: colors.textPrimary }]}>
                      {closed ? 'Geschlossen' : `${day!.open} – ${day!.close}`}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Pressable
              onPress={() => goToOwnerScreen('/org/opening-hours')}
              style={[styles.ctaButton, { borderColor: colors.borderSecondary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.ctaButtonText, { color: colors.primary }]}>
                Öffnungszeiten festlegen
              </Text>
            </Pressable>
          )}
        </View>
        </InlineErrorBoundary>
      ) : null}

      {/* Events */}
      {safeEvents.length > 0 && (
        <InlineErrorBoundary label="org-events">
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Veranstaltungen</Text>
            <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{safeEvents.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {safeEvents.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => router.push(`/event/${event.id}` as any)}
                style={[styles.mediaCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                accessibilityRole="button"
              >
                {event.image_url ? (
                  <Image source={{ uri: event.image_url }} style={styles.mediaCardImage} contentFit="cover" />
                ) : (
                  <View style={[styles.mediaCardImage, { backgroundColor: colors.cardPlaceholder }]} />
                )}
                <View style={styles.mediaCardBody}>
                  <Text style={[styles.mediaCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text style={[styles.mediaCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {formatEventDate(event.date, event.time)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        </InlineErrorBoundary>
      )}

      {/* Blog */}
      {safeBlog.length > 0 && (
        <InlineErrorBoundary label="org-blog">
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Artikel</Text>
            <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{safeBlog.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {safeBlog.map((article) => (
              <Pressable
                key={article.id}
                onPress={() => router.push(`/blog/${article.id}` as any)}
                style={[styles.mediaCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                accessibilityRole="button"
              >
                {article.cover_image_url ? (
                  <Image source={{ uri: article.cover_image_url }} style={styles.mediaCardImage} contentFit="cover" />
                ) : (
                  <View style={[styles.mediaCardImage, { backgroundColor: colors.cardPlaceholder }]} />
                )}
                <View style={styles.mediaCardBody}>
                  <Text style={[styles.mediaCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {article.title}
                  </Text>
                  {article.excerpt ? (
                    <Text style={[styles.mediaCardMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                      {article.excerpt}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        </InlineErrorBoundary>
      )}

      {/* Produkte */}
      {products.length > 0 && (
        <InlineErrorBoundary label="org-products">
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Produkte</Text>
            <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{products.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {products.map((listing) => (
              <Pressable
                key={listing.id}
                onPress={() => router.push(`/marketplace/${listing.id}` as any)}
                style={[styles.mediaCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                accessibilityRole="button"
              >
                {listing.media_urls && listing.media_urls.length > 0 ? (
                  <Image source={{ uri: listing.media_urls[0] }} style={styles.mediaCardImage} contentFit="cover" />
                ) : (
                  <View style={[styles.mediaCardImage, { backgroundColor: colors.cardPlaceholder }]} />
                )}
                <View style={styles.mediaCardBody}>
                  <Text style={[styles.mediaCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {listing.title}
                  </Text>
                  <Text style={[styles.mediaCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {formatPrice(listing.price, listing.price_type)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        </InlineErrorBoundary>
      )}

      {/* Services */}
      {services.length > 0 && (
        <InlineErrorBoundary label="org-services">
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Services</Text>
            <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{services.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {services.map((listing) => (
              <Pressable
                key={listing.id}
                onPress={() => router.push(`/marketplace/${listing.id}` as any)}
                style={[styles.mediaCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                accessibilityRole="button"
              >
                {listing.media_urls && listing.media_urls.length > 0 ? (
                  <Image source={{ uri: listing.media_urls[0] }} style={styles.mediaCardImage} contentFit="cover" />
                ) : (
                  <View style={[styles.mediaCardImage, { backgroundColor: colors.cardPlaceholder }]} />
                )}
                <View style={styles.mediaCardBody}>
                  <Text style={[styles.mediaCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {listing.title}
                  </Text>
                  <Text style={[styles.mediaCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {formatPrice(listing.price, listing.price_type)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        </InlineErrorBoundary>
      )}

      {/* Deals (only when a linked business is found) */}
      {safeDeals.length > 0 && (
        <InlineErrorBoundary label="org-deals">
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Deals</Text>
            <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{safeDeals.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {safeDeals.map((deal) => (
              <View
                key={deal.id}
                style={[styles.mediaCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
              >
                {deal.image_url ? (
                  <Image source={{ uri: deal.image_url }} style={styles.mediaCardImage} contentFit="cover" />
                ) : (
                  <View style={[styles.mediaCardImage, { backgroundColor: colors.cardPlaceholder }]} />
                )}
                <View style={styles.mediaCardBody}>
                  <Text style={[styles.mediaCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {deal.title}
                  </Text>
                  {deal.deal_value ? (
                    <Text style={[styles.mediaCardMeta, { color: colors.primary }]} numberOfLines={1}>
                      {deal.deal_value}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
        </InlineErrorBoundary>
      )}

      {/* Standort / map */}
      {orgLocation ? (
        <InlineErrorBoundary label="org-map-embed">
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Standort</Text>
          {orgLocation.address ? (
            <Text style={[styles.bioText, { color: colors.textSecondary, marginBottom: 12 }]}>
              {orgLocation.address}
            </Text>
          ) : null}
          {mapGeoJSON ? (
            <Pressable
              onPress={openMap}
              accessibilityRole="button"
              accessibilityLabel={`${account.name} auf der Karte ansehen`}
              style={[styles.mapWrap, { borderColor: colors.borderSecondary }]}
            >
              <View style={styles.mapInner} pointerEvents="none">
                <MapboxMapView
                  geojson={mapGeoJSON}
                  onMarkerPress={() => undefined}
                  flyToCoordinate={[orgLocation.lon, orgLocation.lat]}
                />
              </View>
              <View style={[styles.mapOverlay, { backgroundColor: colors.surface }]} pointerEvents="none">
                <Text style={[styles.linkText, { color: colors.primary }]}>Auf Karte ansehen →</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
        </InlineErrorBoundary>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Banner with back button */}
        <View style={[styles.bannerWrap, { backgroundColor: colors.cardPlaceholder }]}>
          {account.cover_url ? (
            <Image
              source={{ uri: account.cover_url }}
              style={StyleSheet.absoluteFill as any}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <Pressable
            onPress={goBack}
            style={[styles.backPill, { backgroundColor: colors.background }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Avatar overlapping banner */}
        <View style={styles.identityRow}>
          {account.avatar_url ? (
            <Image
              source={{ uri: account.avatar_url }}
              style={[styles.avatar, { borderColor: colors.background }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: colors.cardPlaceholder, borderColor: colors.background },
              ]}
            >
              <UserIcon width={48} height={48} color={colors.textTertiary} />
            </View>
          )}
          {canEdit ? (
            <View style={styles.identityActions}>
              <Pressable
                onPress={() => goToOwnerScreen('/org/settings')}
                style={[styles.editPill, { borderColor: colors.borderSecondary, backgroundColor: colors.background }]}
                accessibilityRole="button"
                accessibilityLabel="Profil bearbeiten"
              >
                <Text style={[styles.editPillText, { color: colors.textPrimary }]}>Bearbeiten</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Identity block */}
        <View style={styles.identityBlock}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
              {account.name}
            </Text>
            {account.is_verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.success }]}>
                <Text style={styles.verifiedCheck}>✓</Text>
              </View>
            )}
          </View>

          {(subType || showExternBadge) && (
            <View style={styles.pillRow}>
              {subType && (
                <View style={[styles.subTypePill, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.subTypeText, { color: colors.textSecondary }]}>
                    {subType.emoji} {subType.label}
                  </Text>
                </View>
              )}
              {showExternBadge && (
                <View style={[styles.subTypePill, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.subTypeText, { color: colors.textSecondary }]}>
                    Extern · {account.extern_status === 'pending' ? 'in Prüfung' : 'abgelehnt'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {account.bio ? (
            <Text style={[styles.bioText, { color: colors.textPrimary }]}>{account.bio}</Text>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={styles.tabsWrap}>
          <ProfileTabs
            tabs={[
              { key: 'info', label: 'Info' },
              { key: 'posts', label: 'Beiträge', count: posts.length },
            ]}
            active={activeTab}
            onChange={(key) => setActiveTab(key as TabKey)}
          />
        </View>

        <InlineErrorBoundary label="org-tabs-content">
          {activeTab === 'info' ? (
            renderInfoTab()
          ) : (
            <InlineErrorBoundary label="org-posts-list">
              <AccountPostsList accountId={account.id} />
            </InlineErrorBoundary>
          )}
        </InlineErrorBoundary>
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountPageSkeleton({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.bannerWrap, { backgroundColor: colors.cardPlaceholder }]}>
          <Pressable
            onPress={onBack}
            style={[styles.backPill, { backgroundColor: colors.background }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.identityRow}>
          <Skeleton
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            borderRadius={AVATAR_SIZE / 2}
            style={{ borderWidth: 4, borderColor: colors.background } as any}
          />
        </View>

        <View style={styles.identityBlock}>
          <Skeleton width={'60%' as any} height={26} borderRadius={6} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Skeleton width={90} height={26} borderRadius={13} />
            <Skeleton width={120} height={26} borderRadius={13} />
          </View>
          <Skeleton width={'100%' as any} height={16} borderRadius={4} />
          <Skeleton width={'85%' as any} height={16} borderRadius={4} />
        </View>

        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.section, { borderTopColor: colors.border }]}>
            <Skeleton width={140} height={20} borderRadius={6} style={{ marginBottom: 12 } as any} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Skeleton width={200} height={170} borderRadius={14} />
              <Skeleton width={200} height={170} borderRadius={14} />
              <Skeleton width={120} height={170} borderRadius={14} />
            </View>
          </View>
        ))}

        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Skeleton width={120} height={20} borderRadius={6} style={{ marginBottom: 12 } as any} />
          <Skeleton width={'100%' as any} height={200} borderRadius={14} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  bannerWrap: {
    width: '100%',
    height: 200,
    overflow: 'hidden',
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
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -(AVATAR_SIZE / 2),
  },
  identityActions: {
    paddingBottom: 8,
  },
  editPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  editPillText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  identityBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 24,
    fontFamily: 'Inter-SemiBold',
    flexShrink: 1,
  },
  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedCheck: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  subTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  subTypeText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  tabsWrap: {
    marginTop: 20,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    marginHorizontal: 16,
    marginTop: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  sectionCount: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  linkText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  membersCount: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  hList: {
    gap: 12,
    paddingRight: 16,
  },
  mediaCard: {
    width: 200,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mediaCardImage: {
    width: '100%',
    height: 110,
  },
  mediaCardBody: {
    padding: 10,
    gap: 4,
  },
  mediaCardTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 18,
  },
  mediaCardMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  mapWrap: {
    height: 200,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  mapInner: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  openStatus: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  hoursList: {
    gap: 6,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hoursDay: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    width: 40,
  },
  hoursTime: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  ctaButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
