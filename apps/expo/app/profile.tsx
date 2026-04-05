import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Switch, Image, Modal } from 'react-native';
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
import BottomNavigation from '@/components/BottomNavigation';
import LoginDrawer from '@/components/LoginDrawer';
import LogoutDrawer from '@/components/LogoutDrawer';
import GovernanceTestBanner from '@/components/GovernanceTestBanner';
import ProfileMenuItem from '@/components/ProfileMenuItem';
import BusinessStatusBanner from '@/components/BusinessStatusBanner';
import FlippableIdentityCard from '@/components/FlippableIdentityCard';
import ProfileModeCards from '@/components/profile/ProfileModeCards';

// Import SVG icons
import UploadIcon from '@/assets/icons/profile/upload.svg';
import SentIcon from '@/assets/icons/profile/sent.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';
import HelpCircleIcon from '@/assets/icons/profile/help-circle.svg';
import ShieldUserIcon from '@/assets/icons/profile/shield-user.svg';
import QrCodeIcon from '@/assets/icons/qr-code.svg';
import MailIcon from '@/assets/icons/mail.svg';
import SettingsIcon from '@/assets/icons/profile/settings.svg';
import PencilIcon from '@/assets/icons/pencil.svg';
import StarIcon from '@/assets/icons/star.svg';
import WalletIcon from '@/assets/icons/profile/wallet.svg';

export default function ProfileScreen() {
  const router = useRouter();
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { bookmarkedIds } = useBookmarks();
  const { isGovernanceTestEnabled, toggleGovernanceTesting } = useGovernanceTest();
  const { hasCitizenNFT, hasAttesterNFT, hasAnyNFT, activePendingRequest, refresh } = useVerificationContext();
  const { user, tier, tierLabel, isCitizen, refreshUser } = useUser();
  const { activeAccount, ownedAccounts, switchAccount, refreshAccounts } = useAccount();
  const [businessRecord, setBusinessRecord] = useState<BusinessRecord | null>(null);
  const isBusinessOwner = ownedAccounts.some(a => a.account_type !== 'personal') || !!businessRecord;
  const userBusiness = businessRecord;
  const isExtendedMode = tier !== 'guest';
  const { colors } = useTheme();

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'profile'>('profile');
  const [showLoginDrawer, setShowLoginDrawer] = useState(false);
  const [showLogoutDrawer, setShowLogoutDrawer] = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isConnected = !!account;

  // Auto-close login drawer when user successfully logs in
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

  const handleTabPress = (tab: 'home' | 'explore' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') {
      router.replace('/');
    } else if (tab === 'explore') {
      router.push('/explore');
    }
  };

  const handleGovernanceTestToggle = async () => {
    await toggleGovernanceTesting();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshUser(), refreshAccounts()]);
    setRefreshing(false);
  };

  const displayName = user?.username || shortenAddress(account?.address);
  const orgAccount = ownedAccounts.find(a => a.account_type !== 'personal');
  const showBusinessRegister = isCitizen && !isBusinessOwner && !orgAccount;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mein Röbel</Text>
        {ownedAccounts.length > 1 && (
          <Pressable onPress={() => setShowAccountSheet(true)} style={styles.switchButton}>
            <Text style={[styles.switchButtonText, { color: colors.textSecondary }]}>Account wechseln</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Flippable Identity Card */}
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

        {/* Mode-specific action cards */}
        <ProfileModeCards />

        {!isConnected ? (
          // ============= NOT LOGGED IN STATE =============
          <View style={styles.notConnectedContainer}>
            {/* Show "Noch keinen Account" section */}
            <View style={[styles.emptyStateContainer, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Noch keinen Account</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Sie sind noch nicht angemeldet.
              </Text>

              <Pressable
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowLoginDrawer(true)}
              >
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                  Jetzt Anmelden
                </Text>
              </Pressable>
            </View>

            {/* Always show bookmarked section */}
            <View style={styles.bookmarkedSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gemerkte Veranstaltungen</Text>
              <View style={styles.bookmarkedContainer}>
                <BookmarkedEvents events={events} />
              </View>
            </View>

            {/* Menu Items */}
            <View style={styles.menuSection}>
              {isExtendedMode && (
                <>
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem
                      icon={<PencilIcon width={20} height={20} color={colors.textPrimary} />}
                      label="Design System"
                      onPress={() => router.push('/design-system' as any)}
                    />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                </>
              )}

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
          // ============= LOGGED IN STATE =============
          <View style={styles.connectedContainer}>
            {/* Governance Test Banner */}
            <GovernanceTestBanner
              isTestingEnabled={isGovernanceTestEnabled}
              onPress={handleGovernanceTestToggle}
            />

            {/* Bookmarked Events */}
            <View style={styles.bookmarkedSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gemerkte Veranstaltungen</Text>
              <View style={styles.bookmarkedContainer}>
                <BookmarkedEvents events={events} />
              </View>
            </View>

            {/* Menu Items */}
            <View style={styles.menuSection}>
              <View style={styles.menuGroup}>
                <ProfileMenuItem
                  icon={<PencilIcon width={20} height={20} color={colors.textPrimary} />}
                  label="Profil bearbeiten"
                  onPress={() => router.push('/edit-profile' as any)}
                />
              </View>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

              {/* Business Registration - for verified citizens without a business */}
              {showBusinessRegister && (
                <>
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem
                      icon={<StarIcon width={20} height={20} color={colors.textPrimary} />}
                      label="Organisation erstellen"
                      onPress={() => router.push('/create-org' as any)}
                    />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                </>
              )}

              {/* Business Status Banner - for business owners with pending/rejected business */}
              {isBusinessOwner && userBusiness && userBusiness.status !== 'approved' && (
                <BusinessStatusBanner
                  business={userBusiness}
                  onPress={() => router.push({ pathname: '/org-status', params: { businessId: userBusiness.id } } as any)}
                />
              )}

              {/* Verification Menu Group - Only show for verified users */}
              {hasAnyNFT && (
                <>
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem
                      icon={<QrCodeIcon width={20} height={20} color={colors.textPrimary} />}
                      label="QR-Code scannen"
                      onPress={() => router.push('/verification/scan' as any)}
                    />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                </>
              )}

              {/* Wallet */}
              {isConnected && (
                <>
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem
                      icon={<WalletIcon width={20} height={20} color={colors.textPrimary} />}
                      label="Wallet"
                      onPress={() => router.push('/wallet' as any)}
                    />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                </>
              )}

              {/* Design System - only in extended mode */}
              {isExtendedMode && (
                <>
                  <View style={styles.menuGroup}>
                    <ProfileMenuItem
                      icon={<PencilIcon width={20} height={20} color={colors.textPrimary} />}
                      label="Design System"
                      onPress={() => router.push('/design-system' as any)}
                    />
                  </View>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                </>
              )}

              {/* Regular Menu Items */}
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
        )}

        {/* Extended Mode Toggle - hidden unless already enabled or 5-tap easter egg */}
        {isExtendedMode && (
          <View style={styles.extendedModeSection}>
            <View style={[styles.extendedModeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.extendedModeRow}>
              <Text style={[styles.extendedModeLabel, { color: colors.textSecondary }]}>Erweiterte Version</Text>
              <Switch
                value={isExtendedMode}
                onValueChange={() => {}}
                trackColor={{ false: colors.switchTrackOff, true: colors.primary }}
                thumbColor="#ffffff"
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onTabPress={handleTabPress}
      />

      {/* Drawers */}
      <LoginDrawer
        visible={showLoginDrawer}
        onClose={() => setShowLoginDrawer(false)}
      />

      <LogoutDrawer
        visible={showLogoutDrawer}
        onClose={() => setShowLogoutDrawer(false)}
        onLogout={handleDisconnect}
      />

      {/* Account Switcher Sheet */}
      <Modal visible={showAccountSheet} transparent animationType="fade" onRequestClose={() => setShowAccountSheet(false)}>
        <Pressable style={accountSheetStyles.backdrop} onPress={() => setShowAccountSheet(false)}>
          <Pressable style={[accountSheetStyles.sheet, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
            <Text style={[accountSheetStyles.title, { color: colors.textPrimary }]}>Account wechseln</Text>

            {ownedAccounts.map((acc) => {
              const isActive = activeAccount?.id === acc.id;
              const emoji = acc.account_type === 'personal' ? '👤' : acc.account_type === 'verein' ? '🤝' : acc.account_type === 'partei' ? '🏛️' : acc.account_type === 'fraktion' ? '⚖️' : '🏢';
              const typeLabel = acc.account_type === 'personal' ? 'Persönlich' : acc.account_type === 'unternehmen' ? 'Unternehmen' : acc.account_type === 'verein' ? 'Verein' : acc.account_type === 'partei' ? 'Partei' : 'Fraktion';

              return (
                <Pressable
                  key={acc.id}
                  onPress={() => { switchAccount(acc.id); setShowAccountSheet(false); }}
                  style={[
                    accountSheetStyles.accountRow,
                    { borderColor: isActive ? colors.primary : colors.border },
                    isActive && { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <View style={[accountSheetStyles.accountIcon, { backgroundColor: colors.surface }]}>
                    <Text style={accountSheetStyles.accountEmoji}>{emoji}</Text>
                  </View>
                  <View style={accountSheetStyles.accountInfo}>
                    <Text style={[accountSheetStyles.accountName, { color: colors.textPrimary }]}>{acc.name}</Text>
                    <Text style={[accountSheetStyles.accountType, { color: colors.textSecondary }]}>{typeLabel}</Text>
                  </View>
                  {isActive && <Text style={[accountSheetStyles.checkmark, { color: colors.primary }]}>✓</Text>}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
  },
  notConnectedContainer: {
    flex: 1,
  },
  emptyStateContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
    textAlign: 'left',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
    textAlign: 'left',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  connectedContainer: {
    paddingTop: 24,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  profileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  profilePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePlaceholderText: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  userTextContainer: {
    flex: 1,
    gap: 2,
  },
  userAddress: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'left',
  },
  userLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'left',
  },
  userBio: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  logoutIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookmarkedSection: {
    marginBottom: 32,
  },
  bookmarkedContainer: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  menuSection: {
    paddingHorizontal: 16,
  },
  menuGroup: {
    gap: 8,
  },
  menuDivider: {
    height: 1,
    marginVertical: 16,
  },
  extendedModeSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  extendedModeDivider: {
    height: 1,
    marginBottom: 16,
  },
  extendedModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  extendedModeLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  switchButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});

const accountSheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    marginBottom: 16,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountEmoji: {
    fontSize: 20,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  accountType: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
});
