import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import { fetchOrgListings, deleteListing } from '@/lib/supabase-marketplace';
import { getAccountRole, canEditListings, type AccountRole } from '@/lib/supabase-account-roles';
import type { MarketplaceListingRecord } from '@/lib/types';
import MarketplaceCard from '@/components/MarketplaceCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrgServicesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const { user } = useUser();
  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<AccountRole | null>(null);

  useEffect(() => {
    if (activeAccount?.id && user?.wallet_address) {
      getAccountRole(activeAccount.id, user.wallet_address).then(setUserRole);
    }
  }, [activeAccount?.id, user?.wallet_address]);

  const canEdit = canEditListings(userRole);

  const loadListings = useCallback(async () => {
    if (!activeAccount?.id) return;
    try {
      const data = await fetchOrgListings(activeAccount.id, 'service');
      setListings(data);
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.id]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadListings();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteListing(id);
      setListings(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error('Error deleting service:', error);
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert(
      'Anzeige löschen',
      'Möchtest du diese Anzeige wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: () => handleDelete(id) },
      ]
    );
  };

  const activeListings = listings.filter(l => l.status === 'active');
  const inactiveListings = listings.filter(l => l.status !== 'active');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dienstleistungen</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Add button */}
        {canEdit && (
          <View style={styles.addSection}>
            <Pressable
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push({ pathname: '/create-listing', params: { listingType: 'service', accountId: activeAccount?.id } } as any)}
            >
              <Text style={[styles.addButtonText, { color: colors.onPrimary }]}>+ Neue Dienstleistung</Text>
            </Pressable>
          </View>
        )}

        {/* Active listings */}
        {activeListings.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Aktive Dienstleistungen ({activeListings.length})
            </Text>
            <View style={styles.listingsGrid}>
              {activeListings.map(listing => (
                <View key={listing.id} style={styles.listingWrapper}>
                  <Pressable onPress={() => router.push(`/marketplace/${listing.id}` as any)}>
                    <MarketplaceCard listing={listing} compact={false} />
                  </Pressable>
                  {canEdit && (
                    <View style={styles.listingActions}>
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface }]}
                        onPress={() => router.push(`/marketplace/edit/${listing.id}` as any)}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.primary }]}>Bearbeiten</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface }]}
                        onPress={() => confirmDelete(listing.id)}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.error }]}>Löschen</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Inactive listings */}
        {inactiveListings.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              Inaktiv ({inactiveListings.length})
            </Text>
            <View style={styles.listingsGrid}>
              {inactiveListings.map(listing => (
                <View key={listing.id} style={[styles.listingWrapper, { opacity: 0.6 }]}>
                  <Pressable onPress={() => router.push(`/marketplace/${listing.id}` as any)}>
                    <MarketplaceCard listing={listing} compact={false} />
                  </Pressable>
                  {canEdit && (
                    <View style={styles.listingActions}>
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface }]}
                        onPress={() => router.push(`/marketplace/edit/${listing.id}` as any)}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.primary }]}>Bearbeiten</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface }]}
                        onPress={() => confirmDelete(listing.id)}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.error }]}>Löschen</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {listings.length === 0 && !loading && (
          <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
            <Text style={styles.emptyEmoji}>🛠️</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Keine Dienstleistungen</Text>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              Füge deine erste Dienstleistung hinzu, damit sie im Marktplatz erscheint.
            </Text>
          </View>
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  headerSpacer: { width: 40 },
  content: { flex: 1 },
  addSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  addButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  section: {
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  listingsGrid: {
    paddingHorizontal: 16,
    gap: 12,
  },
  listingWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  listingActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 40,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomPadding: { height: 40 },
});
