import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Linking,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import {
  ArrowLeftIcon,
  CallIcon,
  HeartFilledIcon,
  HeartIcon,
  InformationCircleIcon,
  LocationIcon,
  MailIcon,
  ShareIcon,
} from '@/components/Icons';
import BadgeCheckIcon from '@/assets/icons/badge-check.svg';
import PencilEditIcon from '@/assets/icons/pencil-edit-01.svg';
import UserIcon from '@/assets/icons/user.svg';
import { VERIFIED_GOLD } from '@/components/profile/IdentityRow';
import AccountPostsList from '@/components/profile/AccountPostsList';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import { SERVICE_CATEGORIES, PRODUCT_CATEGORIES } from '@/constants/listing-categories';
import { MARKETPLACE_CATEGORY_LABELS } from '@/lib/map/constants';
import { transformedImageUrl } from '@/lib/image-url';
import {
  WEEK_DAYS,
  todayKey,
  formatListingPrice,
  MEMBER_ROLE_LABELS,
} from '@/lib/org-profile';
import type {
  Account,
  AccountComment,
  AccountRatingSummary,
  BlogArticle,
  BusinessDealRecord,
  EventRecord,
  MarketplaceListingRecord,
  MemberWithProfile,
  OpeningHours,
} from '@/lib/types';
import OrgReviewsSection from './OrgReviewsSection';
import { HERO_HEIGHT } from './OrgProfileHero';

type SectionKey = 'photos' | 'about' | 'services' | 'more' | 'team' | 'reviews' | 'info' | 'posts';

const SECTION_LABELS: Record<SectionKey, string> = {
  photos: 'Fotos',
  about: 'Über uns',
  services: 'Leistungen',
  more: 'Mehr',
  team: 'Team',
  reviews: 'Bewertungen',
  info: 'Info',
  posts: 'Beiträge',
};

const TOP_BAR_HEIGHT = 56;
const TAB_BAR_HEIGHT = 48;
const FEATURED = '__featured';
const FEATURED_LIMIT = 6;
const ABOUT_LINES = 4;

type Props = {
  account: Account;
  /** The shared photo + identity header (OrgProfileHero). */
  hero: React.ReactNode;
  members: MemberWithProfile[];
  services: MarketplaceListingRecord[];
  products: MarketplaceListingRecord[];
  deals: BusinessDealRecord[];
  events: EventRecord[];
  blog: BlogArticle[];
  postsCount: number;
  openingHours: OpeningHours | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  ratingSummary: AccountRatingSummary | null;
  comments: AccountComment[];
  liked: boolean;
  canEdit: boolean;
  onBack: () => void;
  onShare: () => void;
  onToggleLike: () => void;
  onRate: () => void;
  onOpenMap?: () => void;
  onEditHours: () => void;
};

function listingCategoryLabel(key: string): string {
  return (
    [...SERVICE_CATEGORIES, ...PRODUCT_CATEGORIES].find((c) => c.key === key)?.label ||
    MARKETPLACE_CATEGORY_LABELS[key] ||
    key
  );
}

function formatEventDate(date: string | null | undefined, time: string | null): string {
  if (!date) return '';
  const d = new Date(`${date}T${time ?? '00:00:00'}`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day} · ${String(time).slice(0, 5)} Uhr` : day;
}

/**
 * Business (sub_type 'unternehmen') profile, modelled on a booking-app shop
 * page: one long scroll of sections (Über uns, Leistungen, Mehr, Team,
 * Bewertungen, Info). Once the photo scrolls away a fixed header fades in
 * with the name and a tab strip that follows the section in view; tapping a
 * tab scrolls to it. A bottom bar keeps the booking CTA in reach.
 */
export default function BusinessProfileView(props: Props) {
  const {
    account,
    hero,
    members,
    services,
    products,
    deals,
    events,
    blog,
    postsCount,
    openingHours,
    phone,
    website,
    address,
    ratingSummary,
    comments,
    liked,
    canEdit,
    onBack,
    onShare,
    onToggleLike,
    onRate,
    onOpenMap,
    onEditHours,
  } = props;
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const tabScrollRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);
  const sectionYs = useRef<Partial<Record<SectionKey, number>>>({});
  const tabXs = useRef<Partial<Record<SectionKey, number>>>({});
  const [active, setActive] = useState<SectionKey>('photos');
  const [headerShown, setHeaderShown] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [aboutTruncatable, setAboutTruncatable] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<string>(FEATURED);
  const [bottomBarHeight, setBottomBarHeight] = useState(96);

  const headerHeight = insets.top + TOP_BAR_HEIGHT + TAB_BAR_HEIGHT;
  // The fixed header takes over once the photo has scrolled under it.
  const revealAt = HERO_HEIGHT - insets.top - TOP_BAR_HEIGHT;

  const hasInfo =
    !!openingHours || !!account.contact_email || !!phone || !!website || !!address || account.is_verified;
  const moreCount = products.length + deals.length + events.length + blog.length;

  const sections = useMemo<SectionKey[]>(() => {
    const list: SectionKey[] = ['photos'];
    if (account.bio) list.push('about');
    if (services.length) list.push('services');
    if (moreCount) list.push('more');
    if (members.length) list.push('team');
    list.push('reviews');
    if (hasInfo) list.push('info');
    if (postsCount > 0) list.push('posts');
    return list;
  }, [account.bio, services.length, moreCount, members.length, hasInfo, postsCount]);

  const serviceCategories = useMemo(() => {
    const keys = [...new Set(services.map((s) => s.category).filter(Boolean))];
    return keys.map((key) => ({ key, label: listingCategoryLabel(key) }));
  }, [services]);

  const visibleServices = useMemo(() => {
    if (serviceFilter === FEATURED) {
      return [...services]
        .sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0))
        .slice(0, FEATURED_LIMIT);
    }
    return services.filter((s) => s.category === serviceFilter);
  }, [services, serviceFilter]);

  const activeRef = useRef<SectionKey>('photos');
  const setActiveSection = useCallback((key: SectionKey) => {
    if (activeRef.current === key) return;
    activeRef.current = key;
    setActive(key);
    // Keep the active tab in view inside the horizontally scrolling strip.
    const x = tabXs.current[key];
    if (x != null) tabScrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, []);

  const onScrollJs = useCallback(
    (y: number, contentHeight: number, viewportHeight: number) => {
      const shouldShow = y >= revealAt;
      setHeaderShown((prev) => (prev === shouldShow ? prev : shouldShow));

      const probe = y + headerHeight + 8;
      let current: SectionKey = 'photos';
      for (const key of sections) {
        const sy = sectionYs.current[key];
        if (key === 'photos' || sy == null) continue;
        if (sy <= probe) current = key;
      }
      // At the very bottom the last short sections can never reach the
      // probe line — hand the tab to the last one so it is still reachable.
      if (y + viewportHeight >= contentHeight - 4) {
        current = sections[sections.length - 1];
      }
      setActiveSection(current);
    },
    [revealAt, headerHeight, sections, setActiveSection]
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      runOnJS(onScrollJs)(e.contentOffset.y, e.contentSize.height, e.layoutMeasurement.height);
    },
  });

  const scrollToSection = (key: SectionKey) => {
    const y = key === 'photos' ? 0 : (sectionYs.current[key] ?? 0) - headerHeight + 1;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    setActiveSection(key);
  };

  const recordSection = (key: SectionKey, e: LayoutChangeEvent) => {
    sectionYs.current[key] = e.nativeEvent.layout.y;
  };

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [revealAt - 40, revealAt], [0, 1], Extrapolation.CLAMP),
  }));

  const today = todayKey();

  const outlineButton = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineButton,
        { borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
    >
      <Text style={[styles.outlineButtonText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  const moreRow = (key: string, title: string, subtitle: string, cta: string, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} style={styles.moreRow} accessibilityRole="button">
      <View style={styles.moreRowText}>
        <Text style={[styles.moreRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.moreRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {outlineButton(cta, onPress)}
    </Pressable>
  );

  const divider = <View style={[styles.divider, { backgroundColor: colors.border }]} />;

  // Bottom bar: services first, otherwise the "Mehr" offers, otherwise contact.
  type BottomBar = { text: string; cta: string; target: 'services' | 'more' | 'mail' };
  let bottomBar: BottomBar | null = null;
  if (services.length) {
    bottomBar = {
      text: `${services.length} ${services.length === 1 ? 'Leistung' : 'Leistungen'} verfügbar`,
      cta: 'Jetzt buchen',
      target: 'services',
    };
  } else if (moreCount) {
    bottomBar = {
      text: `${moreCount} ${moreCount === 1 ? 'Angebot' : 'Angebote'} verfügbar`,
      cta: 'Ansehen',
      target: 'more',
    };
  } else if (account.contact_email) {
    bottomBar = { text: 'Fragen? Schreib uns.', cta: 'Kontakt', target: 'mail' };
  }

  const onBottomBarPress = (target: BottomBar['target']) => {
    if (target === 'mail') {
      Linking.openURL(`mailto:${account.contact_email}`).catch(() => undefined);
    } else {
      scrollToSection(target);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: (bottomBar ? bottomBarHeight : insets.bottom) + 24 }}
      >
        {hero}

        {account.bio ? (
          <View onLayout={(e) => recordSection('about', e)} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über uns</Text>
            <Text
              style={[styles.aboutText, { color: colors.textPrimary }]}
              numberOfLines={aboutExpanded ? undefined : ABOUT_LINES}
              onTextLayout={(e) => {
                if (!aboutExpanded && e.nativeEvent.lines.length > ABOUT_LINES) setAboutTruncatable(true);
              }}
            >
              {account.bio}
            </Text>
            {aboutTruncatable && !aboutExpanded ? (
              <Pressable onPress={() => setAboutExpanded(true)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.readMore, { color: colors.primary }]}>Mehr lesen</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {services.length ? (
          <InlineErrorBoundary label="business-services">
            <View
              onLayout={(e) => recordSection('services', e)}
              style={[styles.section, styles.servicesSection, { backgroundColor: colors.surfaceSecondary }]}
            >
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Leistungen</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScroll}
                contentContainerStyle={styles.chips}
              >
                {[{ key: FEATURED, label: 'Empfohlen' }, ...serviceCategories].map((chip) => {
                  const selected = chip.key === serviceFilter;
                  return (
                    <Pressable
                      key={chip.key}
                      onPress={() => setServiceFilter(chip.key)}
                      style={[
                        styles.chip,
                        selected
                          ? { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }
                          : { borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: selected ? colors.background : colors.textPrimary },
                        ]}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.serviceList}>
                {visibleServices.map((s) => {
                  const open = () => router.push(`/marketplace/${s.id}` as any);
                  const price = formatListingPrice(s.price, s.price_type);
                  return (
                    <Pressable
                      key={s.id}
                      onPress={open}
                      style={[styles.serviceCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                      accessibilityRole="button"
                    >
                      <View style={styles.serviceText}>
                        <Text style={[styles.serviceTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                          {s.title}
                        </Text>
                        {s.description ? (
                          <Text
                            style={[styles.serviceSubtitle, { color: colors.textSecondary }]}
                            numberOfLines={1}
                          >
                            {s.description}
                          </Text>
                        ) : null}
                        {price ? (
                          <Text style={[styles.servicePrice, { color: colors.textPrimary }]}>{price}</Text>
                        ) : null}
                      </View>
                      {outlineButton('Buchen', open)}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </InlineErrorBoundary>
        ) : null}

        {moreCount ? (
          <InlineErrorBoundary label="business-more">
            <View onLayout={(e) => recordSection('more', e)} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mehr</Text>
              {products.map((p) =>
                moreRow(p.id, p.title, formatListingPrice(p.price, p.price_type), 'Kaufen', () =>
                  router.push(`/marketplace/${p.id}` as any)
                )
              )}
              {deals.map((d) =>
                moreRow(d.id, d.title, d.deal_value || d.description || 'Angebot', 'Ansehen', () =>
                  router.push(`/deals/${d.id}` as any)
                )
              )}
              {events.map((ev) =>
                moreRow(ev.id, ev.title, formatEventDate(ev.date, ev.time), 'Ansehen', () =>
                  router.push(`/event/${ev.id}` as any)
                )
              )}
              {blog.map((a) =>
                moreRow(a.id, a.title, a.excerpt || 'Artikel', 'Lesen', () =>
                  router.push(`/blog/${a.id}` as any)
                )
              )}
            </View>
          </InlineErrorBoundary>
        ) : null}

        {members.length ? (
          <View onLayout={(e) => recordSection('team', e)} style={styles.section}>
            {moreCount ? divider : null}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Team</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.teamScroll}
              contentContainerStyle={styles.teamList}
            >
              {members.map((m) => {
                const username = m.user?.username ?? null;
                const avatar = m.user?.profile_picture_url ?? null;
                return (
                  <Pressable
                    key={m.wallet_address}
                    onPress={username ? () => router.push(`/user/${username}` as any) : undefined}
                    disabled={!username}
                    style={styles.teamMember}
                    accessibilityRole={username ? 'button' : undefined}
                  >
                    <View>
                      {avatar ? (
                        <Image
                          source={{ uri: transformedImageUrl(avatar, { width: 360 }) ?? avatar }}
                          style={[styles.teamAvatar, { borderColor: colors.border }]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          accessibilityIgnoresInvertColors
                        />
                      ) : (
                        <View
                          style={[
                            styles.teamAvatar,
                            styles.teamAvatarFallback,
                            { backgroundColor: colors.cardPlaceholder, borderColor: colors.border },
                          ]}
                        >
                          <UserIcon width={48} height={48} color={colors.textTertiary} />
                        </View>
                      )}
                      <View
                        style={[
                          styles.rolePill,
                          { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.rolePillText, { color: colors.textPrimary }]}>
                          {MEMBER_ROLE_LABELS[m.role] ?? 'Team'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.teamName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {username || 'Mitglied'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <InlineErrorBoundary label="business-reviews">
          <View onLayout={(e) => recordSection('reviews', e)} style={styles.section}>
            {moreCount || members.length ? divider : null}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Bewertungen</Text>
            <OrgReviewsSection summary={ratingSummary} comments={comments} onRate={onRate} />
          </View>
        </InlineErrorBoundary>

        {hasInfo ? (
          <InlineErrorBoundary label="business-info">
            <View onLayout={(e) => recordSection('info', e)} style={styles.section}>
              {divider}
              {openingHours ? (
                <>
                  <View style={styles.titleRow}>
                    <Text style={[styles.sectionTitle, styles.titleInRow, { color: colors.textPrimary }]}>
                      Öffnungszeiten
                    </Text>
                    {canEdit ? (
                      <Pressable
                        onPress={onEditHours}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Öffnungszeiten bearbeiten"
                      >
                        <PencilEditIcon width={20} height={20} color={colors.textSecondary} />
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.hoursList}>
                    {WEEK_DAYS.map(({ key, label }) => {
                      const day = openingHours[key];
                      const range = day && !day.closed ? `${day.open} – ${day.close}` : null;
                      const closed = !range;
                      const isToday = key === today;
                      const weight = isToday ? styles.hoursToday : null;
                      return (
                        <View key={key} style={styles.hoursRow}>
                          <View
                            style={[
                              styles.hoursDot,
                              { backgroundColor: closed ? colors.textTertiary : colors.success },
                            ]}
                          />
                          <Text style={[styles.hoursDay, weight, { color: colors.textPrimary }]}>{label}</Text>
                          <Text
                            style={[
                              styles.hoursTime,
                              weight,
                              { color: closed ? colors.textSecondary : colors.textPrimary },
                            ]}
                          >
                            {range ?? 'Geschlossen'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  {divider}
                </>
              ) : null}

              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Weitere Informationen</Text>
              <View style={styles.infoList}>
                {account.is_verified ? (
                  <View style={styles.infoRow}>
                    <BadgeCheckIcon width={24} height={24} color={VERIFIED_GOLD} />
                    <Text style={[styles.infoText, { color: colors.textPrimary }]}>
                      Verifiziertes Unternehmen in Röbel
                    </Text>
                  </View>
                ) : null}
                {address ? (
                  <Pressable
                    onPress={onOpenMap}
                    disabled={!onOpenMap}
                    style={styles.infoRow}
                    accessibilityRole={onOpenMap ? 'button' : undefined}
                  >
                    <LocationIcon size={24} color={colors.textPrimary} />
                    <Text style={[styles.infoText, { color: colors.textPrimary }]}>{address}</Text>
                  </Pressable>
                ) : null}
                {phone ? (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${phone}`).catch(() => undefined)}
                    style={styles.infoRow}
                    accessibilityRole="link"
                  >
                    <CallIcon size={24} color={colors.textPrimary} />
                    <Text style={[styles.infoText, { color: colors.textPrimary }]}>{phone}</Text>
                  </Pressable>
                ) : null}
                {account.contact_email ? (
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${account.contact_email}`).catch(() => undefined)}
                    style={styles.infoRow}
                    accessibilityRole="link"
                  >
                    <MailIcon size={24} color={colors.textPrimary} />
                    <Text style={[styles.infoText, { color: colors.textPrimary }]}>{account.contact_email}</Text>
                  </Pressable>
                ) : null}
                {website ? (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(/^https?:\/\//.test(website) ? website : `https://${website}`).catch(
                        () => undefined
                      )
                    }
                    style={styles.infoRow}
                    accessibilityRole="link"
                  >
                    <InformationCircleIcon size={24} color={colors.textPrimary} />
                    <Text style={[styles.infoText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {website.replace(/^https?:\/\//, '')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </InlineErrorBoundary>
        ) : null}

        {postsCount > 0 ? (
          <View onLayout={(e) => recordSection('posts', e)} style={styles.postsSection}>
            <View style={styles.postsTitleWrap}>
              {divider}
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Beiträge</Text>
            </View>
            <InlineErrorBoundary label="business-posts">
              <AccountPostsList accountId={account.id} />
            </InlineErrorBoundary>
          </View>
        ) : null}
      </Animated.ScrollView>

      {/* Fixed header — fades in once the photo has scrolled away. */}
      <Animated.View
        pointerEvents={headerShown ? 'box-none' : 'none'}
        style={[
          styles.fixedHeader,
          headerStyle,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Zurück">
            <ArrowLeftIcon size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {account.name}
          </Text>
          <Pressable onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="Teilen">
            <ShareIcon size={24} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={onToggleLike}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Nicht mehr merken' : 'Merken'}
          >
            {liked ? <HeartFilledIcon size={24} color="#E53935" /> : <HeartIcon size={24} color={colors.textPrimary} />}
          </Pressable>
        </View>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabBar, { borderBottomColor: colors.border }]}
          contentContainerStyle={styles.tabBarContent}
        >
          {sections.map((key) => {
            const selected = key === active;
            return (
              <Pressable
                key={key}
                onPress={() => scrollToSection(key)}
                onLayout={(e) => {
                  tabXs.current[key] = e.nativeEvent.layout.x;
                }}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: selected ? colors.textPrimary : colors.textSecondary },
                    selected && styles.tabTextActive,
                  ]}
                >
                  {SECTION_LABELS[key]}
                </Text>
                <View
                  style={[
                    styles.tabIndicator,
                    { backgroundColor: selected ? colors.textPrimary : 'transparent' },
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      {bottomBar ? (
        <View
          onLayout={(e) => setBottomBarHeight(e.nativeEvent.layout.height)}
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <Text style={[styles.bottomBarText, { color: colors.textSecondary }]} numberOfLines={1}>
            {bottomBar.text}
          </Text>
          <Pressable
            onPress={() => onBottomBarPress(bottomBar.target)}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.textPrimary, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryButtonText, { color: colors.background }]}>{bottomBar.cta}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  servicesSection: {
    paddingBottom: 32,
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleInRow: {
    marginBottom: 0,
  },
  divider: {
    height: 1,
    marginBottom: 32,
  },
  aboutText: {
    fontSize: 17,
    lineHeight: 25,
    fontFamily: 'MonaSans-Regular',
  },
  readMore: {
    fontSize: 17,
    fontFamily: 'MonaSans-Medium',
    marginTop: 6,
  },
  chipsScroll: {
    marginHorizontal: -16,
    marginBottom: 20,
  },
  chips: {
    paddingHorizontal: 16,
    gap: 10,
  },
  chip: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 16,
    fontFamily: 'MonaSans-Medium',
  },
  serviceList: {
    gap: 14,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  serviceText: {
    flex: 1,
    gap: 4,
  },
  serviceTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'MonaSans-Medium',
  },
  serviceSubtitle: {
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
  },
  servicePrice: {
    fontSize: 16,
    fontFamily: 'MonaSans-SemiBold',
    marginTop: 10,
  },
  outlineButton: {
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSans-Medium',
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  moreRowText: {
    flex: 1,
    gap: 3,
  },
  moreRowTitle: {
    fontSize: 18,
    fontFamily: 'MonaSans-Medium',
  },
  moreRowSubtitle: {
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
  },
  teamScroll: {
    marginHorizontal: -16,
  },
  teamList: {
    paddingHorizontal: 16,
    gap: 20,
  },
  teamMember: {
    width: 128,
    alignItems: 'center',
  },
  teamAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
  },
  teamAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePill: {
    position: 'absolute',
    bottom: -12,
    alignSelf: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePillText: {
    fontSize: 13,
    fontFamily: 'MonaSans-SemiBold',
  },
  teamName: {
    fontSize: 17,
    fontFamily: 'MonaSans-Medium',
    marginTop: 20,
  },
  hoursList: {
    gap: 14,
    marginBottom: 32,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hoursDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 16,
  },
  hoursDay: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'MonaSans-Regular',
  },
  hoursTime: {
    fontSize: 17,
    fontFamily: 'MonaSans-Regular',
  },
  hoursToday: {
    fontFamily: 'MonaSans-SemiBold',
  },
  infoList: {
    gap: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'MonaSans-Regular',
  },
  postsSection: {
    paddingTop: 32,
  },
  postsTitleWrap: {
    paddingHorizontal: 16,
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 18,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  tabBar: {
    height: TAB_BAR_HEIGHT,
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    gap: 24,
  },
  tab: {
    height: TAB_BAR_HEIGHT,
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'MonaSans-Regular',
  },
  tabTextActive: {
    fontFamily: 'MonaSans-SemiBold',
  },
  tabIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    borderRadius: 2,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomBarText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'MonaSans-Regular',
  },
  primaryButton: {
    height: 54,
    paddingHorizontal: 28,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontFamily: 'MonaSans-SemiBold',
  },
});
