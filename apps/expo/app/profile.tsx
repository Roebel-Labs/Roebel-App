import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { useIsBusinessOwner } from '@/hooks/useIsBusinessOwner';
import { useIsCitizen } from '@/hooks/useIsCitizen';
import { useDailyMint } from '@/hooks/useDailyMint';
import { useOrgMemberPreview } from '@/hooks/useOrgMemberPreview';
import { useAccount } from '@/context/AccountContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import { Events, track } from '@/lib/analytics';
import type { CredentialKind } from '@/lib/credentials';
import { badgeTileForEvent, groupBadgesByYear, type BadgeTile, type RegisterCard } from '@/lib/credreg/model';
import { shareRoute } from '@/lib/credreg/collect';
import { sendReadyClaims } from '@/lib/credreg/pending';
import { announceHeldChanged } from '@/lib/credreg/held';
import { makePrivate } from '@/lib/credreg/visibility';
import { makePublic } from '@/lib/credreg/accept';
import { useProfileCredentials } from '@/hooks/useProfileCredentials';
import { useHolder } from '@/lib/card-design/holder-values';
import { profileHeaderTitle } from '@/lib/profile-header';
import { ORG_PROFILE_ACTIONS, PERSONAL_PROFILE_ACTIONS } from '@/lib/profile-actions';
import { SUB_TYPE_EMOJI } from '@/lib/types';
import BottomNavigation, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import { GlassBackdrop, GlassProvider } from '@/components/GlassSurface';
import LoginDrawer from '@/components/LoginDrawer';
import LogoutDrawer from '@/components/LogoutDrawer';
import BuergerWerdenBanner from '@/components/profile/BuergerWerdenBanner';
import BusinessStatusBanner from '@/components/BusinessStatusBanner';
import RewardsCTABanner from '@/components/profile/RewardsCTABanner';
import CitizenVerificationBanner from '@/components/profile/CitizenVerificationBanner';
import StoryCollectionsBar from '@/components/feed/StoryCollectionsBar';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileSheet from '@/components/profile/ProfileSheet';
import CredentialCardStack from '@/components/profile/CredentialCardStack';
import BadgeGrid, { hasCollectedStamp } from '@/components/profile/BadgeGrid';
import CredentialDetailSheet from '@/components/profile/CredentialDetailSheet';
import IdentityRow from '@/components/profile/IdentityRow';
import OrgIdentityRow from '@/components/profile/OrgIdentityRow';
import MuenzenButton from '@/components/profile/MuenzenButton';
import ProfileActionGrid from '@/components/profile/ProfileActionGrid';
import ProfileMenu from '@/components/profile/ProfileMenu';
import AccountSwitchSheet from '@/components/profile/AccountSwitchSheet';
import { fetchProfileStoryCollections, type StoryCollection } from '@/lib/supabase-story-collections';
import SponsoringBanner from '@/components/profile/SponsoringBanner';
import { DANCECUP_SLUG } from '@/lib/sponsoring';
import ProfileCompletionCard from '@/components/profile/ProfileCompletionCard';
import TallyDutyCard from '@/components/profile/TallyDutyCard';
import MyTasksCard from '@/components/profile/MyTasksCard';
import QrCodeIcon from '@/assets/icons/qr-code.svg';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import GlassIconButton from '@/components/GlassIconButton';
import ScreenTransition from '@/components/skeleton/ScreenTransition';
import { ProfileEntrySkeleton } from '@/components/skeleton/EntrySkeletons';
import { useNavHideStyle, useScrollChrome } from '@/hooks/useScrollChrome';

/** How far the header's fade reaches below the bar itself. */
const HEADER_FADE = 28;

/** `#RRGGBB` (or rgb/rgba) → same color at `alpha`; the gradient fades in one hue, never via black. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  const rgb = /^rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(color.replace(/\s/g, ''));
  return rgb ? `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})` : 'transparent';
}

type Tab = 'home' | 'explore' | 'profile';

export default function ProfileScreen() {
  const router = useRouter();
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { hasAttesterNFT, hasAnyNFT, activePendingRequest, userRequests, refresh } = useVerificationContext();
  const isCitizen = useIsCitizen();
  const { user, refreshUser } = useUser();
  const { activeAccount, ownedAccounts, recentOtherAccounts, switchAccount, refreshAccounts } = useAccount();
  const { isBusinessOwner, businesses } = useIsBusinessOwner();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [showLoginDrawer, setShowLoginDrawer] = useState(false);
  const [showLogoutDrawer, setShowLogoutDrawer] = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);
  const chrome = useScrollChrome();
  const navHideStyle = useNavHideStyle(chrome.visible);
  // The nav clearance lives INSIDE the sheet, so the sheet's own color runs to
  // the very bottom (padding on the scroll content showed a backdrop strip).
  const sheetBottomPad = BOTTOM_NAV_HEIGHT + insets.bottom + 16;
  const [storyCollections, setStoryCollections] = useState<StoryCollection[]>([]);

  const isConnected = !!account;
  const isOrg = activeAccount?.account_type === 'organisation';
  const citizenRequest = userRequests.find((r: any) => r.nft_type === 'citizen') || null;
  const isAspiringCitizen = !isOrg && !isCitizen && !!citizenRequest && user?.preferred_role !== 'tourist';
  const wantsToBeCitizen = !isOrg && !isCitizen && !isAspiringCitizen && user?.preferred_role === 'buerger';
  const showGrid = !isOrg && (isCitizen || isAspiringCitizen);
  const userBusiness = businesses.find((b) => b.status === 'published') || businesses[0] || null;

  const mint = useDailyMint({ isCitizen });
  // Closed gate: exactly today's built-in cards, no credential request (useHeld is not mounted).
  const creds = useProfileCredentials({ isCitizen, isAttester: !!hasAttesterNFT });
  const [detailCard, setDetailCard] = useState<RegisterCard | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // A `credential_visibility` push opens the detail sheet of its type (once per push), as soon as
  // that card is loaded.
  const { credential: credentialParam, badge: badgeParam } = useLocalSearchParams<{ credential?: string; badge?: string }>();
  const [handledCredentialParam, setHandledCredentialParam] = useState<string | null>(null);
  // "Ansehen" from the stamp moment (`/profile?badge=<eventId>`) opens that badge's sheet once.
  const [handledBadgeParam, setHandledBadgeParam] = useState<string | null>(null);
  const [detailTile, setDetailTile] = useState<BadgeTile | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const badgeGroups = creds.open ? groupBadgesByYear(creds.profile.badges, creds.pendingBadges, creds.queued) : [];
  const pushedTile =
    creds.open && typeof badgeParam === 'string' && handledBadgeParam !== badgeParam ? badgeTileForEvent(badgeGroups, badgeParam) : null;
  const pushedCard =
    creds.open && typeof credentialParam === 'string' && handledCredentialParam !== credentialParam
      ? ([...creds.profile.cards, ...creds.profile.badges].find(
          (c) => c.source === 'register' && c.key.toLowerCase() === credentialParam.toLowerCase(),
        ) ?? null)
      : null;
  const shownCard = detailCard ?? pushedCard ?? (detailTile ? null : pushedTile?.card ?? null);
  const shownTile = shownCard ? null : detailTile ?? (pushedTile && !pushedTile.card ? pushedTile : null);
  const dismissPushedCard = () => {
    if (typeof credentialParam === 'string') setHandledCredentialParam(credentialParam);
    if (typeof badgeParam === 'string') setHandledBadgeParam(badgeParam);
  };
  const members = useOrgMemberPreview(isOrg ? activeAccount?.id : undefined);

  useEffect(() => {
    fetchProfileStoryCollections().then(setStoryCollections);
  }, []);

  const handleDisconnect = async () => {
    if (wallet) {
      track(Events.LOGOUT, { tier: user?.tier });
      disconnect(wallet);
      setShowLogoutDrawer(false);
    }
  };

  const handleTabPress = (tab: Tab) => {
    if (tab === 'home') router.replace('/');
    else if (tab === 'explore') router.push('/explore');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshUser(), refreshAccounts()]);
    setRefreshing(false);
  };

  const displayName = user?.display_name || user?.username || 'Du';
  // Fills the name field of designed cards, on this device only (verified name first).
  const holder = useHolder(account?.address, user?.display_name || user?.username || null);
  const personalAvatarUrl = user?.profile_picture_url ?? null;
  const profileHref = user?.username
    ? ({ pathname: '/user/[username]', params: { username: user.username } } as const)
    : ('/edit-profile' as const);
  const openExplainer = (kind: CredentialKind) =>
    router.push({ pathname: '/citizen-verification', params: { card: kind } } as any);
  const openCard = (card: RegisterCard) => {
    if (card.source === 'builtin') {
      if (card.builtin) openExplainer(card.builtin);
      return;
    }
    setCardError(null);
    setDetailCard(card);
  };
  const closeCard = () => {
    if (cardBusy) return;
    dismissPushedCard();
    setDetailCard(null);
    setDetailTile(null);
    setCardError(null);
  };
  const openTile = (tile: BadgeTile) => {
    setCardError(null);
    setDetailTile(tile);
  };
  const shareBadge = (card: RegisterCard) => {
    if (!card.eventId) return;
    dismissPushedCard();
    setDetailCard(null);
    router.push(
      shareRoute({ eventId: card.eventId, eventTitle: card.eventTitle ?? card.title, eventDate: card.eventDate ?? '', name: card.title, imageUrl: card.imageUrl }) as any,
    );
  };
  // "<n> Abzeichen bereit · Jetzt eintragen": the waiting public badges in one operation.
  const enterReadyBadges = async () => {
    if (!account || readyBusy) return;
    setReadyBusy(true);
    setReadyError(null);
    try {
      await sendReadyClaims(account);
      announceHeldChanged();
    } catch {
      setReadyError('Das hat nicht geklappt. Bitte versuche es gleich noch einmal.');
    } finally {
      setReadyBusy(false);
    }
  };
  const showCard = (card: RegisterCard) => {
    dismissPushedCard();
    setDetailCard(null);
    router.push({ pathname: '/credentials/show/[key]', params: { key: card.key } } as any);
  };
  const makeCardPrivate = async (card: RegisterCard) => {
    if (!account || cardBusy) return;
    setCardBusy(true);
    setCardError(null);
    const result = await makePrivate(account, card);
    setCardBusy(false);
    if (!result.ok) {
      setCardError(result.message);
      return;
    }
    dismissPushedCard();
    setDetailCard(null);
    await creds.refresh();
  };

  const makeCardPublic = async (card: RegisterCard) => {
    if (!account || cardBusy || !card.typeId) return;
    const typeKey = card.typeId.toLowerCase();
    const held = creds.held.find((h) => h.typeId.toLowerCase() === typeKey);
    if (!held) return;
    setCardBusy(true);
    setCardError(null);
    // Refuses expired cards and orgs that keep members private; the proof comes fresh from the server.
    const result = await makePublic(account, held);
    setCardBusy(false);
    if (!result.ok) {
      setCardError(result.message);
      return;
    }
    dismissPushedCard();
    setDetailCard(null);
    await creds.refresh();
  };
  const openPending = () => {
    const only = creds.pending.length === 1 ? creds.pending[0] : null;
    router.push((only ? `/credentials/accept/${only.id}` : '/credentials') as any);
  };

  const muenzenSlot =
    mint.state === 'hidden' ? null : (
      <MuenzenButton
        state={mint.state}
        amount={mint.amount}
        onClaim={mint.claim}
        onOpen={() => router.push('/rewards' as any)}
        cooldownEnd={mint.cooldownEnd}
      />
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.backdrop }]} edges={['top', 'left', 'right']}>
      <GlassProvider>
        <GlassBackdrop style={styles.content}>
          <Animated.ScrollView
            style={styles.content}
            onScroll={chrome.onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingTop: headerHeight }}
            scrollIndicatorInsets={{ top: headerHeight }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          >
            {!isConnected ? (
              <ProfileSheet flat style={{ paddingBottom: sheetBottomPad }}>
                <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Noch keinen Account</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Sie sind noch nicht angemeldet.</Text>
                  <Pressable
                    style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                    onPress={() => setShowLoginDrawer(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Jetzt anmelden"
                  >
                    <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Jetzt Anmelden</Text>
                  </Pressable>
                </View>
                <RewardsCTABanner variant="guest" />
                <ProfileMenu variant="guest" />
              </ProfileSheet>
            ) : isOrg ? (
              <ProfileSheet flat style={{ paddingBottom: sheetBottomPad }}>
                <OrgIdentityRow
                  name={activeAccount?.name || 'Organisation'}
                  avatarUrl={activeAccount?.avatar_url || activeAccount?.cover_url || null}
                  emoji={(activeAccount?.sub_type && SUB_TYPE_EMOJI[activeAccount.sub_type]) || '🏢'}
                  verified={!!activeAccount?.is_verified}
                  members={members.users}
                  memberCount={members.count}
                  onMembers={() => router.push('/org/manage' as any)}
                />
                {isBusinessOwner && userBusiness && userBusiness.status !== 'published' && (
                  <View style={styles.bannerWrap}>
                    <BusinessStatusBanner
                      business={userBusiness}
                      onPress={() => router.push({ pathname: '/org-status', params: { businessId: userBusiness.id } } as any)}
                    />
                  </View>
                )}
                <SponsoringBanner slug={DANCECUP_SLUG} />
                <ProfileActionGrid items={ORG_PROFILE_ACTIONS} />
                <ProfileMenu variant="org" />
              </ProfileSheet>
            ) : (
              <>
                {creds.loader}
                {creds.open && creds.pending.length > 0 && (
                  <Pressable
                    onPress={openPending}
                    style={[styles.pendingRow, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                    accessibilityRole="button"
                    accessibilityLabel="Neuer Ausweis wartet auf dich"
                  >
                    <Text style={[styles.pendingText, { color: colors.primary }]}>Neuer Ausweis wartet auf dich</Text>
                    <Text style={[styles.pendingAction, { color: colors.primary }]}>Ansehen</Text>
                  </Pressable>
                )}
                {creds.open && creds.readyClaims > 0 && (
                  <Pressable
                    onPress={enterReadyBadges}
                    disabled={readyBusy}
                    style={[styles.pendingRow, { backgroundColor: colors.primaryLight, borderColor: colors.primary }, readyBusy && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${creds.readyClaims} Abzeichen bereit, jetzt eintragen`}
                  >
                    <Text style={[styles.pendingText, { color: colors.primary }]}>
                      {readyError ?? `${creds.readyClaims} Abzeichen bereit`}
                    </Text>
                    <Text style={[styles.pendingAction, { color: colors.primary }]}>{readyBusy ? 'Wird eingetragen…' : 'Jetzt eintragen'}</Text>
                  </Pressable>
                )}
                <CredentialCardStack cards={creds.profile.cards} onPress={openCard} holder={holder} animateFront={!shownCard} />
                <ProfileSheet style={{ paddingBottom: sheetBottomPad }}>
                  <IdentityRow
                    name={displayName}
                    avatarUrl={personalAvatarUrl}
                    verified={isCitizen || !!hasAttesterNFT}
                    onPress={() => router.push(profileHref as any)}
                    right={muenzenSlot}
                  />
                  <ProfileCompletionCard user={user} />
                  {/* Stempel: only after the first collected stamp (no empty section before). */}
                  {creds.open && hasCollectedStamp(creds.profile.badges, creds.queued) && (
                    <BadgeGrid
                      badges={creds.profile.badges}
                      pending={creds.pendingBadges}
                      queued={creds.queued}
                      onPress={openCard}
                      onPressTile={openTile}
                    />
                  )}
                  {hasAttesterNFT && <TallyDutyCard wallet={account?.address} />}
                  <MyTasksCard wallet={account?.address} />
                  {isAspiringCitizen && (
                    <View style={styles.bannerWrap}>
                      <CitizenVerificationBanner pending={!!activePendingRequest} />
                    </View>
                  )}
                  {wantsToBeCitizen && (
                    <View style={styles.bannerWrap}>
                      <BuergerWerdenBanner />
                    </View>
                  )}
                  {showGrid && <ProfileActionGrid items={PERSONAL_PROFILE_ACTIONS} />}
                  {(isCitizen || isAspiringCitizen || wantsToBeCitizen) && (
                    <StoryCollectionsBar collections={storyCollections} heading="Lerne mehr über die Röbel App" />
                  )}
                  <ProfileMenu variant="personal" gridless={!showGrid} />
                </ProfileSheet>
              </>
            )}
          </Animated.ScrollView>
        </GlassBackdrop>

        {/* First open: matched skeleton until the profile is there; back from a detail page: blur → sharp. */}
        <ScreenTransition
          skeleton={<ProfileEntrySkeleton sheetColor={colors.background} />}
          ready={!isConnected || !!user}
          topInset={headerHeight}
          backgroundColor={colors.backdrop}
        />

        {/* Floating title bar: content scrolls under it and fades out through
            a gradient (opaque at the top → 0 % at its bottom edge) instead of
            being cut by a hard bar. */}
        <View
          pointerEvents="box-none"
          style={styles.headerOverlay}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            setHeaderHeight((prev) => (prev === h ? prev : h));
          }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[colors.backdrop, colors.backdrop, withAlpha(colors.backdrop, 0)]}
            locations={[0, 0.55, 1]}
            style={[StyleSheet.absoluteFill, { bottom: -HEADER_FADE }]}
          />
          <ProfileHeader
            title={isConnected ? profileHeaderTitle(activeAccount) : 'Profil'}
            switcherVisible={isConnected && ownedAccounts.length > 1}
            recentOtherAccounts={recentOtherAccounts}
            personalAvatarUrl={personalAvatarUrl}
            onSwitch={() => setShowAccountSheet(true)}
          />
        </View>

        {hasAnyNFT && (
          <Animated.View style={[styles.qrFab, navHideStyle]}>
            <GlassIconButton
              size={56}
              tint={colors.primary}
              onPress={() => router.push('/verification/scan' as any)}
              accessibilityLabel="QR-Code scannen"
            >
              <QrCodeIcon width={24} height={24} color={colors.onPrimary} />
            </GlassIconButton>
          </Animated.View>
        )}

        {/* Slides away on scroll-down, like Austausch. */}
        <Animated.View style={[styles.navOverlay, navHideStyle]}>
          <BottomNavigation activeTab="profile" onTabPress={handleTabPress} glass />
        </Animated.View>

        {/* Closes itself once the login lands (no effect needed). */}
        <LoginDrawer visible={showLoginDrawer && !isConnected} onClose={() => setShowLoginDrawer(false)} />
        {creds.open && (
          <CredentialDetailSheet
            card={shownCard}
            tile={shownTile}
            onShare={shareBadge}
            onClose={closeCard}
            onShow={showCard}
            onMakePrivate={makeCardPrivate}
            onMakePublic={makeCardPublic}
            busy={cardBusy}
            error={cardError}
            holder={holder}
          />
        )}
        <LogoutDrawer visible={showLogoutDrawer} onClose={() => setShowLogoutDrawer(false)} onLogout={handleDisconnect} />
        <AccountSwitchSheet
          visible={showAccountSheet}
          onClose={() => setShowAccountSheet(false)}
          accounts={ownedAccounts}
          activeAccountId={activeAccount?.id ?? null}
          personalAvatarUrl={personalAvatarUrl}
          personalName={user?.username ?? null}
          onSelect={(id) => {
            switchAccount(id);
            setShowAccountSheet(false);
          }}
          onLogout={() => {
            setShowAccountSheet(false);
            if (wallet) disconnect(wallet);
          }}
        />
      </GlassProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  pendingText: { fontSize: 15, fontFamily: 'MonaSans-SemiBold', flexShrink: 1 },
  pendingAction: { fontSize: 14, fontFamily: 'MonaSans-Medium' },
  container: { flex: 1 },
  content: { flex: 1 },
  navOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  bannerWrap: { marginTop: 16 },
  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'MonaSans-Medium', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, fontFamily: 'MonaSans-Regular', marginBottom: 12 },
  primaryButton: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  qrFab: {
    position: 'absolute',
    bottom: BOTTOM_NAV_HEIGHT + 40,
    right: 16,
    zIndex: 10,
  },
});
