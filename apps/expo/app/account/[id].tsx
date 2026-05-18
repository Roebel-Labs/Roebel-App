import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import UserIcon from '@/assets/icons/user.svg';
import AvatarStack from '@/components/AvatarStack';
import MapboxMapView from '@/components/map/MapboxMapView';
import { fetchAccountById } from '@/lib/supabase-accounts';
import { fetchMembersWithProfiles } from '@/lib/supabase-member-management';
import { fetchAccountPosts, fetchEventsByAccount } from '@/lib/supabase-posts';
import { fetchOrgListings } from '@/lib/supabase-marketplace';
import { listForAccount as listBlogForAccount } from '@/lib/supabase-blog-articles';
import { fetchDealsByBusiness } from '@/lib/supabase-deals';
import { resolveOrgLocation, type OrgLocation } from '@/lib/org-location';
import type {
  Account,
  MemberWithProfile,
  OrgSubType,
  EventRecord,
  BlogArticle,
  MarketplaceListingRecord,
  BusinessDealRecord,
} from '@/lib/types';
import type { PostRecord } from '@/lib/types/feed';

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

function formatEventDate(date: string, time: string | null): string {
  try {
    const d = new Date(date + 'T' + (time ?? '00:00:00'));
    const day = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    if (!time) return day;
    const hhmm = time.slice(0, 5);
    return `${day} · ${hhmm}`;
  } catch {
    return date;
  }
}

function formatPrice(price: number, priceType: string): string {
  if (priceType === 'free') return 'Gratis';
  const formatted = price.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${formatted} €${priceType === 'negotiable' ? ' VB' : ''}`;
}

export default function PublicAccountScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [account, setAccount] = useState<Account | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [blogArticles, setBlogArticles] = useState<BlogArticle[]>([]);
  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);
  const [deals, setDeals] = useState<BusinessDealRecord[]>([]);
  const [orgLocation, setOrgLocation] = useState<OrgLocation | null>(null);
  const [contentLoading, setContentLoading] = useState(true);

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
        setContentLoading(true);
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
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, members]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
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

  const openMap = () => {
    if (!orgLocation) return;
    router.push({
      pathname: '/location',
      params: { focusEntityType: orgLocation.entityType, focusEntityId: orgLocation.entityId },
    } as any);
  };

  const handleContactPress = () => {
    if (!account.contact_email) return;
    Linking.openURL(`mailto:${account.contact_email}`).catch(() => undefined);
  };

  const mapGeoJSON = orgLocation
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Banner */}
        <View style={[styles.banner, { backgroundColor: colors.cardPlaceholder }]}>
          {account.cover_url ? (
            <Image
              source={{ uri: account.cover_url }}
              style={StyleSheet.absoluteFill as any}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <Pressable onPress={goBack} style={[styles.backPill, { backgroundColor: colors.background }]} hitSlop={8}>
            <ChevronLeftIcon width={20} height={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          {account.avatar_url ? (
            <Image
              source={{ uri: account.avatar_url }}
              style={[styles.avatar, { borderColor: colors.background }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.cardPlaceholder, borderColor: colors.background }]}>
              <UserIcon width={36} height={36} color={colors.textTertiary} />
            </View>
          )}

          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
              {account.name}
            </Text>
            {account.is_verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.success }]}>
                <Text style={styles.verifiedCheck}>✓</Text>
                <Text style={styles.verifiedText}>Verifiziert</Text>
              </View>
            )}
          </View>

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
        </View>

        {/* Bio */}
        {account.bio ? (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über uns</Text>
            <Text style={[styles.bioText, { color: colors.textSecondary }]}>{account.bio}</Text>
          </View>
        ) : null}

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

        {/* Posts */}
        {contentLoading ? (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}

        {posts.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Beiträge</Text>
              <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{posts.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {posts.map((post) => (
                <Pressable
                  key={post.id}
                  onPress={() => router.push(`/post/${post.id}` as any)}
                  style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                  accessibilityRole="button"
                >
                  {post.media_urls && post.media_urls.length > 0 ? (
                    <Image source={{ uri: post.media_urls[0] }} style={styles.postImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.postImage, { backgroundColor: colors.cardPlaceholder }]} />
                  )}
                  <Text
                    style={[styles.postText, { color: colors.textPrimary }]}
                    numberOfLines={3}
                  >
                    {post.content}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Events */}
        {events.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Veranstaltungen</Text>
              <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{events.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {events.map((event) => (
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
        )}

        {/* Blog */}
        {blogArticles.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Artikel</Text>
              <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{blogArticles.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {blogArticles.map((article) => (
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
        )}

        {/* Marketplace listings (products + services) */}
        {listings.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Angebote</Text>
              <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{listings.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {listings.map((listing) => (
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
                      {listing.listing_type === 'service' ? ' · Service' : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Deals (only when a linked business is found) */}
        {deals.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Deals</Text>
              <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{deals.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {deals.map((deal) => (
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
        )}

        {/* Standort / map */}
        {orgLocation && mapGeoJSON ? (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Standort</Text>
            {orgLocation.address ? (
              <Text style={[styles.bioText, { color: colors.textSecondary, marginBottom: 12 }]}>
                {orgLocation.address}
              </Text>
            ) : null}
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
          </View>
        ) : null}
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
  banner: {
    width: '100%',
    height: 160,
    overflow: 'hidden',
    position: 'relative',
  },
  backPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  avatarSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: -48,
    gap: 10,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingTop: 4,
    paddingHorizontal: 16,
  },
  name: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  verifiedCheck: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  verifiedText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
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
  postCard: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: 120,
  },
  postText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    padding: 10,
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
});
