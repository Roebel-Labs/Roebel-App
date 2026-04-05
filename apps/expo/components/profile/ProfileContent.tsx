import React, { useEffect, useState, lazy, Suspense } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Switch, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { openBrowserAsync } from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { EventRecord, BusinessRecord } from '@/lib/types';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import { useBookmarks } from '@/context/BookmarksContext';
import { useGovernanceTest } from '@/context/GovernanceTestContext';
import { useAccount } from '@/context/AccountContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import BookmarkedEvents from '@/components/BookmarkedEvents';
import LogoutDrawer from '@/components/LogoutDrawer';

const LoginDrawer = lazy(() => import('@/components/LoginDrawer'));
import GovernanceTestBanner from '@/components/GovernanceTestBanner';
import VerificationBanner from '@/components/VerificationBanner';
import ProfileMenuItem from '@/components/ProfileMenuItem';
import TierBadge from '@/components/RoleBadge';
import AccountSwitcher from '@/components/AccountSwitcher';
import BusinessStatusBanner from '@/components/BusinessStatusBanner';
import FlippableIdentityCard from '@/components/FlippableIdentityCard';
import ProfileModeCards from '@/components/profile/ProfileModeCards';

import UploadIcon from '@/assets/icons/profile/upload.svg';
import SentIcon from '@/assets/icons/profile/sent.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';
import HelpCircleIcon from '@/assets/icons/profile/help-circle.svg';
import ShieldUserIcon from '@/assets/icons/profile/shield-user.svg';
import LogoutCircleIcon from '@/assets/icons/profile/logout-circle.svg';
import QrCodeIcon from '@/assets/icons/qr-code.svg';
import SettingsIcon from '@/assets/icons/profile/settings.svg';
import PencilIcon from '@/assets/icons/pencil.svg';
import StarIcon from '@/assets/icons/star.svg';
import WalletIcon from '@/assets/icons/profile/wallet.svg';

export default function ProfileContent() {
  const router = useRouter();
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { isGovernanceTestEnabled, toggleGovernanceTesting } = useGovernanceTest();
  const { hasAnyNFT, refresh } = useVerificationContext();
  const { user, tier, tierLabel, isCitizen, refreshUser } = useUser();
  const { activeAccount, ownedAccounts, switchAccount, refreshAccounts } = useAccount();
  const [businessRecord, setBusinessRecord] = useState<BusinessRecord | null>(null);
  const isBusinessOwner = ownedAccounts.some(a => a.account_type !== 'personal') || !!businessRecord;
  const userBusiness = businessRecord;
  const isExtendedMode = tier !== 'guest';
  const accountMode = activeAccount?.account_type !== 'personal' && activeAccount !== null ? 'business' : 'personal';
  const setAccountMode = (mode: string) => {
    if (mode === 'business') {
      const orgAcc = ownedAccounts.find(a => a.account_type !== 'personal');
      if (orgAcc) switchAccount(orgAcc.id);
    } else {
      const personalAcc = ownedAccounts.find(a => a.account_type === 'personal');
      if (personalAcc) switchAccount(personalAcc.id);
    }
  };
  const toggleExtendedMode = () => {};
  const { colors } = useTheme();

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [showLoginDrawer, setShowLoginDrawer] = useState(false);
  const [showLogoutDrawer, setShowLogoutDrawer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isConnected = !!account;

  useEffect(() => {
    if (isConnected && showLoginDrawer) {
      setShowLoginDrawer(false);
    }
  }, [isConnected]);

  // Fetch business data from businesses table (until business→account migration)
  useEffect(() => {
    if (user?.wallet_address) {
      fetchBusinessesByOwner(user.wallet_address).then(businesses => {
        setBusinessRecord(businesses.find(b => b.status === 'approved') || businesses[0] || null);
      });
    }
  }, [user?.wallet_address]);

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'approved')
        .order('date', { ascending: true })
        .order('time', { ascending: true, nullsFirst: true });

      if (error) throw error;
      if (data) {
        setEvents(data as EventRecord[]);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }

  const handleDisconnect = async () => {
    if (wallet) {
      disconnect(wallet);
      setShowLogoutDrawer(false);
    }
  };

  const shortenAddress = (addr: string | undefined) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshUser(), refreshAccounts()]);
    setRefreshing(false);
  };

  const displayName = user?.username || shortenAddress(account?.address);
  const orgAccount = ownedAccounts.find(a => a.account_type !== 'personal');
  const showAccountSwitcher = !!orgAccount || (isBusinessOwner && userBusiness?.status === 'approved');
  const showBusinessRegister = isCitizen && !isBusinessOwner && !orgAccount;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mein Röbel</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        <FlippableIdentityCard
          user={user}
          role={tier}
          roleLabel={tierLabel}
          isCitizen={isCitizen}
          pointsBalance={0}
          verifiedSince={user?.citizen_verification_date ? new Date(user.citizen_verification_date).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' }) : undefined}
          attestedBy={isCitizen ? 3 : 0}
          votingStreak={user?.voting_streak || 0}
          badges={[]}
          businessName={userBusiness?.name}
        />

        <ProfileModeCards />

        {!isConnected ? (
          <View style={styles.notConnectedContainer}>
            <View style={[styles.emptyStateContainer, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Noch keinen Account</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Sie sind noch nicht angemeldet.
              </Text>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowLoginDrawer(true)}
              >
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Jetzt Anmelden</Text>
              </Pressable>
            </View>

            <View style={styles.bookmarkedSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gemerkte Veranstaltungen</Text>
              <View style={styles.bookmarkedContainer}>
                <BookmarkedEvents events={events} />
              </View>
            </View>

            <View style={styles.menuSection}>
              <View style={styles.menuGroup}>
                <ProfileMenuItem
                  icon={<UploadIcon width={20} height={20} color={colors.textPrimary} />}
                  label="Veranstaltung einsenden"
                  onPress={() => router.push('/submit-event')}
                />
                <ProfileMenuItem
                  icon={<SentIcon width={20} height={20} color={colors.textPrimary} />}
                  label="Feedback geben"
                  onPress={() => router.push('/feedback')}
                />
              </View>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <View style={styles.menuGroup}>
                <ProfileMenuItem
                  icon={<NotificationIcon width={20} height={20} color={colors.textPrimary} />}
                  label="Benachrichtigungen"
                  onPress={() => router.push('/notifications' as any)}
                />
                <ProfileMenuItem
                  icon={<SettingsIcon width={20} height={20} color={colors.textPrimary} />}
                  label="Einstellungen"
                  onPress={() => router.push('/settings' as any)}
                />
                <ProfileMenuItem
                  icon={<HelpCircleIcon width={20} height={20} color={colors.textPrimary} />}
                  label="Über die App"
                  onPress={() => openBrowserAsync('https://www.roebel.app/about')}
                />
                <ProfileMenuItem
                  icon={<ShieldUserIcon width={20} height={20} color={colors.textPrimary} />}
                  label="Datenschutz"
                  onPress={() => openBrowserAsync('https://www.roebel.app/datenschutz')}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.connectedContainer}>
            {showAccountSwitcher && (
              <AccountSwitcher mode={accountMode} onModeChange={setAccountMode} />
            )}

            {accountMode === 'business' && userBusiness ? (
              <>
                <View style={styles.userInfo}>
                  {userBusiness.logo_url ? (
                    <Image source={{ uri: userBusiness.logo_url }} style={styles.profileImage} />
                  ) : (
                    <View style={[styles.profilePlaceholder, { backgroundColor: colors.primary }]}>
                      <Text style={styles.profilePlaceholderText}>{userBusiness.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.userTextContainer}>
                    <Text style={[styles.userAddress, { color: colors.textPrimary }]}>{userBusiness.name}</Text>
                    <TierBadge tier={tier} />
                  </View>
                  <Pressable onPress={() => setShowLogoutDrawer(true)} style={[styles.logoutIconButton, { backgroundColor: colors.surface }]}>
                    <LogoutCircleIcon width={20} height={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <BusinessStatusBanner
                  business={userBusiness}
                  onPress={() => router.push({ pathname: '/org-status', params: { businessId: userBusiness.id } } as any)}
                />
                <View style={styles.menuSection}>
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem icon={<StarIcon width={20} height={20} color={colors.textPrimary} />} label="Dashboard" onPress={() => router.push('/business/dashboard' as any)} />
                    <ProfileMenuItem icon={<UploadIcon width={20} height={20} color={colors.textPrimary} />} label="Angebote verwalten" onPress={() => router.push('/business/dashboard' as any)} />
                    <ProfileMenuItem icon={<PencilIcon width={20} height={20} color={colors.textPrimary} />} label="Statistiken" onPress={() => router.push('/business/analytics' as any)} />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem icon={<SettingsIcon width={20} height={20} color={colors.textPrimary} />} label="Einstellungen" onPress={() => router.push('/settings' as any)} />
                    <ProfileMenuItem icon={<HelpCircleIcon width={20} height={20} color={colors.textPrimary} />} label="Über die App" onPress={() => openBrowserAsync('https://www.roebel.app/about')} />
                    <ProfileMenuItem icon={<ShieldUserIcon width={20} height={20} color={colors.textPrimary} />} label="Datenschutz" onPress={() => openBrowserAsync('https://www.roebel.app/datenschutz')} />
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.userInfo}>
                  {user?.profile_picture_url ? (
                    <Image source={{ uri: user.profile_picture_url }} style={styles.profileImage} />
                  ) : (
                    <View style={[styles.profilePlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
                  )}
                  <View style={styles.userTextContainer}>
                    <Text style={[styles.userAddress, { color: colors.textPrimary }]}>{displayName}</Text>
                    <TierBadge tier={tier} />
                    {user?.bio && <Text style={[styles.userBio, { color: colors.textSecondary }]} numberOfLines={2}>{user.bio}</Text>}
                  </View>
                  <Pressable onPress={() => setShowLogoutDrawer(true)} style={[styles.logoutIconButton, { backgroundColor: colors.surface }]}>
                    <LogoutCircleIcon width={20} height={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <VerificationBanner />
                <GovernanceTestBanner isTestingEnabled={isGovernanceTestEnabled} onPress={() => toggleGovernanceTesting()} />
                <View style={styles.bookmarkedSection}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gemerkte Veranstaltungen</Text>
                  <View style={styles.bookmarkedContainer}><BookmarkedEvents events={events} /></View>
                </View>
                <View style={styles.menuSection}>
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem icon={<PencilIcon width={20} height={20} color={colors.textPrimary} />} label="Profil bearbeiten" onPress={() => router.push('/edit-profile' as any)} />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                  {showBusinessRegister && (
                    <>
                      <View style={styles.menuGroup}>
                        <ProfileMenuItem icon={<StarIcon width={20} height={20} color={colors.textPrimary} />} label="Unternehmen registrieren" onPress={() => router.push('/business/register' as any)} />
                      </View>
                      <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                    </>
                  )}
                  {isBusinessOwner && userBusiness?.status === 'pending' && (
                    <>
                      <View style={styles.menuGroup}>
                        <ProfileMenuItem icon={<StarIcon width={20} height={20} color={colors.textPrimary} />} label="Mein Unternehmen" onPress={() => router.push('/business/dashboard' as any)} />
                      </View>
                      <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                    </>
                  )}
                  {hasAnyNFT && (
                    <>
                      <View style={styles.menuGroup}>
                        <ProfileMenuItem icon={<QrCodeIcon width={20} height={20} color={colors.textPrimary} />} label="QR-Code scannen" onPress={() => router.push('/verification/scan' as any)} />
                      </View>
                      <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                    </>
                  )}
                  {isConnected && (
                    <>
                      <View style={styles.menuGroup}>
                        <ProfileMenuItem icon={<WalletIcon width={20} height={20} color={colors.textPrimary} />} label="Wallet" onPress={() => router.push('/wallet' as any)} />
                      </View>
                      <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                    </>
                  )}
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem icon={<UploadIcon width={20} height={20} color={colors.textPrimary} />} label="Veranstaltung einsenden" onPress={() => router.push('/submit-event')} />
                    <ProfileMenuItem icon={<SentIcon width={20} height={20} color={colors.textPrimary} />} label="Feedback geben" onPress={() => router.push('/feedback')} />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem icon={<SettingsIcon width={20} height={20} color={colors.textPrimary} />} label="Einstellungen" onPress={() => router.push('/settings' as any)} />
                    <ProfileMenuItem icon={<HelpCircleIcon width={20} height={20} color={colors.textPrimary} />} label="Über die App" onPress={() => openBrowserAsync('https://www.roebel.app/about')} />
                    <ProfileMenuItem icon={<ShieldUserIcon width={20} height={20} color={colors.textPrimary} />} label="Datenschutz" onPress={() => openBrowserAsync('https://www.roebel.app/datenschutz')} />
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {isExtendedMode && (
          <View style={styles.extendedModeSection}>
            <View style={[styles.extendedModeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.extendedModeRow}>
              <Text style={[styles.extendedModeLabel, { color: colors.textSecondary }]}>Erweiterte Version</Text>
              <Switch value={isExtendedMode} onValueChange={toggleExtendedMode} trackColor={{ false: colors.switchTrackOff, true: colors.primary }} thumbColor="#ffffff" />
            </View>
          </View>
        )}
      </ScrollView>

      {showLoginDrawer && (
        <Suspense fallback={null}>
          <LoginDrawer visible={showLoginDrawer} onClose={() => setShowLoginDrawer(false)} />
        </Suspense>
      )}

      <LogoutDrawer visible={showLogoutDrawer} onClose={() => setShowLogoutDrawer(false)} onLogout={handleDisconnect} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontFamily: 'Inter-Medium' },
  content: { flex: 1 },
  notConnectedContainer: { flex: 1 },
  emptyStateContainer: { borderWidth: 1, borderRadius: 12, padding: 20, marginHorizontal: 16, marginTop: 24, marginBottom: 32 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Medium', marginBottom: 4, textAlign: 'left' },
  emptySubtitle: { fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 12, textAlign: 'left' },
  primaryButton: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter-Medium' },
  connectedContainer: { paddingTop: 24 },
  userInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 16, gap: 12 },
  profileImage: { width: 48, height: 48, borderRadius: 24 },
  profilePlaceholder: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  profilePlaceholderText: { fontSize: 20, fontFamily: 'Inter-Medium', color: '#ffffff' },
  userTextContainer: { flex: 1, gap: 2 },
  userAddress: { fontSize: 16, fontFamily: 'Inter-Medium', textAlign: 'left' },
  userBio: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
  logoutIconButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  bookmarkedSection: { marginBottom: 32 },
  bookmarkedContainer: { paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter-Medium', marginBottom: 16, paddingHorizontal: 16 },
  menuSection: { paddingHorizontal: 16 },
  menuGroup: { gap: 8 },
  menuDivider: { height: 1, marginVertical: 16 },
  extendedModeSection: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32 },
  extendedModeDivider: { height: 1, marginBottom: 16 },
  extendedModeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  extendedModeLabel: { fontSize: 14, fontFamily: 'Inter-Regular' },
});
