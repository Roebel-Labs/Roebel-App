import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import RestaurantDashboardContent from '@/components/dashboard/RestaurantDashboardContent';
import UnternehmenDashboardContent from '@/components/dashboard/UnternehmenDashboardContent';
import GenericDashboardContent from '@/components/dashboard/GenericDashboardContent';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrgDashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const subType = activeAccount?.sub_type;
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Content components handle their own data fetching on mount
    // A simple delay lets them re-render
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
              {subType ? subType.charAt(0).toUpperCase() + subType.slice(1) : 'Organisation'}
            </Text>
          </View>
        )}

        {subType === 'restaurant' && <RestaurantDashboardContent />}
        {subType === 'unternehmen' && <UnternehmenDashboardContent />}
        {subType && !['restaurant', 'unternehmen'].includes(subType) && <GenericDashboardContent />}

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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: { width: 40 },
  content: { flex: 1 },
  accountInfo: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  accountName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  accountType: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  bottomPadding: { height: 40 },
});
