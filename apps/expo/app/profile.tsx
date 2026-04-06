import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Switch, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { openBrowserAsync } from 'expo-web-browser';
import { BusinessRecord } from '@/lib/types';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import { useAccount } from '@/context/AccountContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import BottomNavigation from '@/components/BottomNavigation';
import LoginDrawer from '@/components/LoginDrawer';
import LogoutDrawer from '@/components/LogoutDrawer';
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
  const { hasCitizenNFT, hasAttesterNFT, hasAnyNFT, activePendingRequest, refresh } = useVerificationContext();
  const { user, tier, tierLabel, isCitizen, refreshUser } = useUser();
  const { activeAccount, ownedAccounts, switchAccount, refreshAccounts } = useAccount();
  const [businessRecord, setBusinessRecord] = useState<BusinessRecord | null>(null);
  const isBusinessOwner = ownedAccounts.some(a => a.account_type === 'organisation') || !!businessRecord;
  const userBusiness = businessRecord;
  const isExtendedMode = tier !== 'guest';
  const { colors } = useTheme();

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

const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshUser(), refreshAccounts()]);
    setRefreshing(false);
  };

  const displayName = user?.username || shortenAddress(account?.address);
  const orgAccount = ownedAccounts.find(a => a.account_type === 'organisation');
  const showBusinessRegister = isCitizen && !isBusinessOwner && !orgAccount;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mein Röbel</Text>
        {ownedAccounts.length > 1 && (
          <Pressable onPress={() => setShowAccountSheet(true)} style={[styles.switchButton, { borderColor: colors.border }]}>
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
            {/* Flippable Identity Card */}
            <FlippableIdentityCard
              user={user}
              role={tier}
              isCitizen={isCitizen}
              verifiedSince={user?.citizen_verification_date ? new Date(user.citizen_verification_date).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' }) : undefined}
              attestedBy={isCitizen ? 3 : 0}
              votingStreak={user?.voting_streak || 0}
              isPending={isBusinessOwner && userBusiness?.status === 'pending'}
              businessName={userBusiness?.name}
            />

            {/* Mode-specific action cards */}
            <ProfileModeCards />

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
              const SUB_TYPE_EMOJI: Record<string, string> = { restaurant: '🍽️', unternehmen: '🏢', verein: '🤝', partei: '🏛️', fraktion: '⚖️' };
              const SUB_TYPE_LABEL: Record<string, string> = { restaurant: 'Restaurant', unternehmen: 'Unternehmen', verein: 'Verein', partei: 'Partei', fraktion: 'Fraktion' };
              const emoji = acc.account_type === 'personal' ? '👤' : (acc.sub_type ? SUB_TYPE_EMOJI[acc.sub_type] || '🏢' : '🏢');
              const typeLabel = acc.account_type === 'personal' ? 'Persönlich' : (acc.sub_type ? SUB_TYPE_LABEL[acc.sub_type] || 'Organisation' : 'Organisation');
              const avatarSource = acc.account_type === 'personal' ? user?.profile_picture_url : (acc.avatar_url || acc.cover_url);
              const accIsPending = acc.account_type === 'organisation' && !acc.is_verified;

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
                  {avatarSource ? (
                    <Image source={{ uri: avatarSource }} style={accountSheetStyles.accountAvatar} />
                  ) : (
                    <View style={[accountSheetStyles.accountIcon, { backgroundColor: colors.surfaceSecondary }]}>
                      <Text style={accountSheetStyles.accountEmoji}>{emoji}</Text>
                    </View>
                  )}
                  <View style={accountSheetStyles.accountInfo}>
                    <Text style={[accountSheetStyles.accountName, { color: colors.textPrimary }]}>{acc.name}</Text>
                    <Text style={[accountSheetStyles.accountType, { color: colors.textSecondary }]}>{typeLabel}</Text>
                  </View>
                  {accIsPending && (
                    <View style={[accountSheetStyles.statusPill, { backgroundColor: colors.warningBackground }]}>
                      <Text style={[accountSheetStyles.statusPillText, { color: colors.warning }]}>In Prüfung</Text>
                    </View>
                  )}
                  {isActive && <Text style={[accountSheetStyles.checkmark, { color: colors.primary }]}>✓</Text>}
                </Pressable>
              );
            })}

            <View style={[accountSheetStyles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              onPress={() => {
                setShowAccountSheet(false);
                if (wallet) disconnect(wallet);
              }}
              style={accountSheetStyles.logoutButton}
            >
              <Text style={accountSheetStyles.logoutText}>Ausloggen</Text>
            </Pressable>
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
    paddingTop: 0,
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
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
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
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountEmoji: {
    fontSize: 20,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
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
  divider: {
    height: 1,
    marginTop: 8,
    marginBottom: 16,
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#EF4444',
  },
});
