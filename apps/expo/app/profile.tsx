import React, { useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { credentialKindsFor, type CredentialKind } from '@/lib/credentials';
import { profileHeaderTitle } from '@/lib/profile-header';
import { ORG_PROFILE_ACTIONS, PERSONAL_PROFILE_ACTIONS } from '@/lib/profile-actions';
import { SUB_TYPE_EMOJI } from '@/lib/types';
import KontoCard from '@/components/payments/KontoCard';
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
import IdentityRow from '@/components/profile/IdentityRow';
import OrgIdentityRow from '@/components/profile/OrgIdentityRow';
import MuenzenButton from '@/components/profile/MuenzenButton';
import ProfileActionGrid from '@/components/profile/ProfileActionGrid';
import ProfileMenu from '@/components/profile/ProfileMenu';
import AccountSwitchSheet from '@/components/profile/AccountSwitchSheet';
import { fetchProfileStoryCollections, type StoryCollection } from '@/lib/supabase-story-collections';
import QrCodeIcon from '@/assets/icons/qr-code.svg';

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

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [showLoginDrawer, setShowLoginDrawer] = useState(false);
  const [showLogoutDrawer, setShowLogoutDrawer] = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [storyCollections, setStoryCollections] = useState<StoryCollection[]>([]);

  const isConnected = !!account;
  const isOrg = activeAccount?.account_type === 'organisation';
  const citizenRequest = userRequests.find((r: any) => r.nft_type === 'citizen') || null;
  const isAspiringCitizen = !isOrg && !isCitizen && !!citizenRequest && user?.preferred_role !== 'tourist';
  const wantsToBeCitizen = !isOrg && !isCitizen && !isAspiringCitizen && user?.preferred_role === 'buerger';
  const showGrid = !isOrg && (isCitizen || isAspiringCitizen);
  const userBusiness = businesses.find((b) => b.status === 'published') || businesses[0] || null;

  const mint = useDailyMint({ isCitizen });
  const members = useOrgMemberPreview(isOrg ? activeAccount?.id : undefined);

  useEffect(() => {
    if (isConnected && showLoginDrawer) setShowLoginDrawer(false);
  }, [isConnected, showLoginDrawer]);

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
    setActiveTab(tab);
    if (tab === 'home') router.replace('/');
    else if (tab === 'explore') router.push('/explore');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshUser(), refreshAccounts()]);
    setRefreshing(false);
  };

  const displayName = user?.display_name || user?.username || 'Du';
  const personalAvatarUrl = user?.profile_picture_url ?? null;
  const profileHref = user?.username
    ? ({ pathname: '/user/[username]', params: { username: user.username } } as const)
    : ('/edit-profile' as const);
  const credentialKinds = credentialKindsFor({ isCitizen, isAttester: !!hasAttesterNFT });
  const openExplainer = (kind: CredentialKind) =>
    router.push({ pathname: '/citizen-verification', params: { card: kind } } as any);

  const muenzenSlot =
    mint.state === 'hidden' ? null : (
      <MuenzenButton
        state={mint.state}
        amount={mint.amount}
        onClaim={mint.claim}
        onOpen={() => router.push('/rewards' as any)}
      />
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <GlassProvider>
        <ProfileHeader
          title={isConnected ? profileHeaderTitle(activeAccount) : 'Profil'}
          switcherVisible={isConnected && ownedAccounts.length > 1}
          recentOtherAccounts={recentOtherAccounts}
          personalAvatarUrl={personalAvatarUrl}
          onSwitch={() => setShowAccountSheet(true)}
        />

        <GlassBackdrop style={styles.content}>
          <ScrollView
            style={styles.content}
            contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          >
            {!isConnected ? (
              <ProfileSheet flat>
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
              <ProfileSheet flat>
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
                <ProfileActionGrid items={ORG_PROFILE_ACTIONS} />
                <ProfileMenu variant="org" />
              </ProfileSheet>
            ) : (
              <>
                <CredentialCardStack kinds={credentialKinds} onPress={openExplainer} />
                <ProfileSheet>
                  <IdentityRow
                    name={displayName}
                    avatarUrl={personalAvatarUrl}
                    verified={isCitizen || !!hasAttesterNFT}
                    onPress={() => router.push(profileHref as any)}
                    right={muenzenSlot}
                  />
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
                  <KontoCard />
                  {(isCitizen || isAspiringCitizen || wantsToBeCitizen) && (
                    <StoryCollectionsBar collections={storyCollections} heading="Lerne mehr über die Röbel App" />
                  )}
                  <ProfileMenu variant="personal" showSubmitEventRow={!showGrid} />
                </ProfileSheet>
              </>
            )}
          </ScrollView>
        </GlassBackdrop>

        {hasAnyNFT && (
          <Pressable
            onPress={() => router.push('/verification/scan' as any)}
            style={[styles.qrFab, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="QR-Code scannen"
          >
            <QrCodeIcon width={24} height={24} color={colors.onPrimary} />
          </Pressable>
        )}

        <View style={styles.navOverlay}>
          <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} glass />
        </View>

        <LoginDrawer visible={showLoginDrawer} onClose={() => setShowLoginDrawer(false)} />
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
  container: { flex: 1 },
  content: { flex: 1 },
  navOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bannerWrap: { marginTop: 16 },
  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Medium', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 12 },
  primaryButton: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  qrFab: {
    position: 'absolute',
    bottom: BOTTOM_NAV_HEIGHT + 40,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
});
