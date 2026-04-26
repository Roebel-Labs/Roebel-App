import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import RestaurantDashboardContent from '@/components/dashboard/RestaurantDashboardContent';
import UnternehmenDashboardContent from '@/components/dashboard/UnternehmenDashboardContent';
import GenericDashboardContent from '@/components/dashboard/GenericDashboardContent';
import JournalistDashboardContent from '@/components/dashboard/JournalistDashboardContent';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { SUB_TYPE_LABELS, isExternPending } from '@/lib/types';

export default function OrgDashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const subType = activeAccount?.sub_type;
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 500));
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dashboard</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {activeAccount && (
          <View style={styles.accountInfo}>
            <Text style={[styles.accountName, { color: colors.textPrimary }]}>
              {activeAccount.name}
            </Text>
            <Text style={[styles.accountType, { color: colors.textTertiary }]}>
              {subType ? SUB_TYPE_LABELS[subType] : 'Organisation'}
            </Text>
          </View>
        )}

        {/* Extern pending banner */}
        {activeAccount && isExternPending(activeAccount) && (
          <View
            style={[
              styles.externBanner,
              {
                backgroundColor: '#FEF3C7',
                borderColor: '#FDE68A',
              },
            ]}
          >
            <Text style={styles.externBannerTitle}>Extern · Wartet auf Freigabe</Text>
            <Text style={styles.externBannerBody}>
              Du kannst Profil und Inhalte vorbereiten, aber noch nicht veröffentlichen. Du erhältst eine E-Mail, sobald dein Konto freigegeben ist.
            </Text>
          </View>
        )}

        {activeAccount?.is_extern && activeAccount.extern_status === 'rejected' && (
          <View
            style={[
              styles.externBanner,
              {
                backgroundColor: '#FEE2E2',
                borderColor: '#FCA5A5',
              },
            ]}
          >
            <Text style={[styles.externBannerTitle, { color: '#7F1D1D' }]}>Antrag abgelehnt</Text>
            <Text style={[styles.externBannerBody, { color: '#7F1D1D' }]}>
              Dein Antrag wurde nicht freigegeben. Bitte kontaktiere das Röbel-Team für Details.
            </Text>
          </View>
        )}

        {subType === 'restaurant' && <RestaurantDashboardContent />}
        {subType === 'unternehmen' && <UnternehmenDashboardContent />}
        {subType === 'journalist' && <JournalistDashboardContent />}
        {subType && !['restaurant', 'unternehmen', 'journalist'].includes(subType) && (
          <GenericDashboardContent />
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-Medium' },
  headerSpacer: { width: 40 },
  content: { flex: 1 },
  accountInfo: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  accountName: { fontSize: 20, fontFamily: 'Inter-SemiBold' },
  accountType: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
  externBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  externBannerTitle: { fontSize: 13, fontFamily: 'Inter-SemiBold', color: '#92400E', marginBottom: 4 },
  externBannerBody: { fontSize: 13, fontFamily: 'Inter-Regular', color: '#92400E', lineHeight: 18 },
  bottomPadding: { height: 40 },
});
