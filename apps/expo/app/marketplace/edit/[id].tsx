import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fetchListingById, updateListing, deleteListing } from '@/lib/supabase-marketplace';
import MeckyNotFound from '@/components/MeckyNotFound';
import { getAccountRole, canEditListings } from '@/lib/supabase-account-roles';
import type { MarketplaceListingRecord, MarketplacePriceType, MarketplaceCondition } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from '@/constants/listing-categories';
import { MARKETPLACE_CATEGORY_LABELS } from '@/lib/map/constants';

const CONDITIONS = [
  { key: 'neu', label: 'Neu' },
  { key: 'wie_neu', label: 'Wie neu' },
  { key: 'gut', label: 'Gut' },
  { key: 'akzeptabel', label: 'Akzeptabel' },
];

const PRICE_TYPES: { key: MarketplacePriceType; label: string }[] = [
  { key: 'fixed', label: 'Festpreis' },
  { key: 'negotiable', label: 'VB' },
  { key: 'free', label: 'Zu verschenken' },
];

const STATUS_OPTIONS: { key: 'active' | 'sold' | 'reserved'; label: string }[] = [
  { key: 'active', label: 'Aktiv' },
  { key: 'sold', label: 'Verkauft' },
  { key: 'reserved', label: 'Reserviert' },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  sold: 'Verkauft',
  reserved: 'Reserviert',
  deleted: 'Gelöscht',
};

const PRICE_TYPE_LABELS: Record<string, string> = {
  fixed: 'Festpreis',
  negotiable: 'VB',
  free: 'Zu verschenken',
};

const CATEGORY_LABELS = MARKETPLACE_CATEGORY_LABELS;

const CONDITION_LABELS: Record<string, string> = Object.fromEntries(
  CONDITIONS.map(c => [c.key, c.label])
);

export default function MarketplaceEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const { user } = useUser();

  const [listing, setListing] = useState<MarketplaceListingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);

  // Edit state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceType, setPriceType] = useState<MarketplacePriceType>('fixed');
  const [category, setCategory] = useState('sonstiges');
  const [condition, setCondition] = useState<MarketplaceCondition | null>('gut');
  const [status, setStatus] = useState<'active' | 'sold' | 'reserved'>('active');
  const [neighborhood, setNeighborhood] = useState('');

  useEffect(() => {
    if (id) loadListing();
  }, [id]);

  const loadListing = async () => {
    try {
      const data = await fetchListingById(id!);
      setListing(data);
      if (data) {
        setTitle(data.title);
        setDescription(data.description || '');
        setPrice(data.price > 0 ? data.price.toString() : '');
        setPriceType(data.price_type);
        setCategory(data.category);
        setCondition(data.condition);
        setStatus(data.status === 'deleted' ? 'active' : data.status);
        setNeighborhood(data.neighborhood || '');

        // Check permissions
        await checkPermission(data);
      }
    } catch (error) {
      console.error('Error loading listing:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkPermission = async (data: MarketplaceListingRecord) => {
    const walletAddress = user?.wallet_address;
    if (!walletAddress) {
      setHasPermission(false);
      setPermissionChecked(true);
      return;
    }

    if (data.account_id) {
      // Org listing: check role
      const role = await getAccountRole(data.account_id, walletAddress);
      setHasPermission(canEditListings(role));
    } else {
      // Personal listing: check wallet match
      setHasPermission(
        walletAddress.toLowerCase() === data.seller_wallet_address.toLowerCase()
      );
    }
    setPermissionChecked(true);
  };

  const handleSave = async () => {
    if (!listing) return;
    if (!title.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen Titel ein.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateListing(listing.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        price: priceType === 'free' ? 0 : parseFloat(price) || 0,
        price_type: priceType,
        category,
        condition: category === 'dienstleistungen' ? null : condition,
        status,
      });
      if (updated) {
        setListing(updated);
      }
      setEditMode(false);
    } catch (error: any) {
      Alert.alert('Fehler', error?.message || 'Änderungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Anzeige löschen',
      'Möchten Sie diese Anzeige wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteListing(listing!.id);
              router.back();
            } catch (error: any) {
              Alert.alert('Fehler', error?.message || 'Löschen fehlgeschlagen.');
            }
          },
        },
      ]
    );
  };

  const formatPrice = (listing: MarketplaceListingRecord): string => {
    if (listing.price_type === 'free') return 'Zu verschenken';
    const formatted = listing.price.toLocaleString('de-DE', {
      style: 'currency',
      currency: 'EUR',
    });
    return listing.price_type === 'negotiable' ? `${formatted} VB` : formatted;
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Not found
  if (!listing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <MeckyNotFound title="Anzeige nicht gefunden" />
      </SafeAreaView>
    );
  }

  // No permission
  if (permissionChecked && !hasPermission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Keine Berechtigung</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isService = listing?.listing_type === 'service' || category === 'dienstleistungen';
  const CATEGORIES = isService ? SERVICE_CATEGORIES : PRODUCT_CATEGORIES;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {editMode ? 'Bearbeiten' : 'Anzeige'}
        </Text>
        <Pressable onPress={() => (editMode ? handleSave() : setEditMode(true))} style={styles.headerAction}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.headerActionText, { color: colors.primary }]}>
              {editMode ? 'Speichern' : 'Bearbeiten'}
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={100}
        extraHeight={150}
      >
        {editMode ? (
          // ---- Edit Mode ----
          <>
            {/* Title */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>TITEL</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Titel der Anzeige"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            {/* Description */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BESCHREIBUNG</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.input, styles.textArea, { color: colors.textPrimary }]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                  placeholder="Beschreibung hinzufügen..."
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            {/* Price Type */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>PREISTYP</Text>
              <View style={styles.chipRow}>
                {PRICE_TYPES.map(pt => (
                  <Pressable
                    key={pt.key}
                    style={[
                      styles.chip,
                      { backgroundColor: priceType === pt.key ? colors.primary : colors.surface },
                    ]}
                    onPress={() => setPriceType(pt.key)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: priceType === pt.key ? colors.onPrimary : colors.textPrimary },
                      ]}
                    >
                      {pt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Price (hidden when free) */}
            {priceType !== 'free' && (
              <View style={styles.fieldSection}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>PREIS (EUR)</Text>
                <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>
            )}

            {/* Category */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>KATEGORIE</Text>
              <View style={styles.chipGrid}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.key}
                    style={[
                      styles.chip,
                      { backgroundColor: category === cat.key ? colors.primary : colors.surface },
                    ]}
                    onPress={() => setCategory(cat.key)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: category === cat.key ? colors.onPrimary : colors.textPrimary },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Condition (hidden for services) */}
            {!isService && (
              <View style={styles.fieldSection}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ZUSTAND</Text>
                <View style={styles.chipRow}>
                  {CONDITIONS.map(cond => (
                    <Pressable
                      key={cond.key}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            condition === cond.key ? colors.primary : colors.surface,
                        },
                      ]}
                      onPress={() => setCondition(cond.key as MarketplaceCondition)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color:
                              condition === cond.key ? colors.onPrimary : colors.textPrimary,
                          },
                        ]}
                      >
                        {cond.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Status */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>STATUS</Text>
              <View style={styles.chipRow}>
                {STATUS_OPTIONS.map(s => (
                  <Pressable
                    key={s.key}
                    style={[
                      styles.chip,
                      { backgroundColor: status === s.key ? colors.primary : colors.surface },
                    ]}
                    onPress={() => setStatus(s.key)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: status === s.key ? colors.onPrimary : colors.textPrimary },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Neighborhood */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>STADTTEIL</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  placeholder="z.B. Altstadt, Seenähe..."
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            {/* Delete button */}
            <Pressable style={[styles.deleteButton, { borderColor: '#EF4444' }]} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Anzeige löschen</Text>
            </Pressable>
          </>
        ) : (
          // ---- View Mode ----
          <>
            <View style={[styles.detailCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.listingTitle, { color: colors.textPrimary }]}>{listing.title}</Text>
              <Text style={[styles.listingPrice, { color: colors.primary }]}>{formatPrice(listing)}</Text>
              {listing.description && (
                <Text style={[styles.listingDescription, { color: colors.textSecondary }]}>
                  {listing.description}
                </Text>
              )}
            </View>

            {/* Info badges */}
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <Text style={[styles.badgeLabel, { color: colors.textTertiary }]}>Status</Text>
                <Text style={[styles.badgeValue, { color: colors.textPrimary }]}>
                  {STATUS_LABELS[listing.status] || listing.status}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <Text style={[styles.badgeLabel, { color: colors.textTertiary }]}>Kategorie</Text>
                <Text style={[styles.badgeValue, { color: colors.textPrimary }]}>
                  {CATEGORY_LABELS[listing.category] || listing.category}
                </Text>
              </View>
            </View>

            <View style={styles.badgeRow}>
              {listing.condition && (
                <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.badgeLabel, { color: colors.textTertiary }]}>Zustand</Text>
                  <Text style={[styles.badgeValue, { color: colors.textPrimary }]}>
                    {CONDITION_LABELS[listing.condition] || listing.condition}
                  </Text>
                </View>
              )}
              {listing.neighborhood && (
                <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.badgeLabel, { color: colors.textTertiary }]}>Stadtteil</Text>
                  <Text style={[styles.badgeValue, { color: colors.textPrimary }]}>
                    {listing.neighborhood}
                  </Text>
                </View>
              )}
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {listing.views_count.toLocaleString('de-DE')}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Aufrufe</Text>
              </View>
            </View>
          </>
        )}

        <View style={styles.bottomPadding} />
      </KeyboardAwareScrollView>
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
  headerAction: {
    width: 80,
    alignItems: 'flex-end',
  },
  headerActionText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 24,
  },
  detailCard: {
    margin: 16,
    borderRadius: 12,
    padding: 20,
    gap: 8,
  },
  listingTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  listingPrice: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  listingDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  badge: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
  },
  badgeLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  badgeValue: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
  },
  statLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  fieldSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 100,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  deleteButton: {
    marginHorizontal: 16,
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#EF4444',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  bottomPadding: {
    height: 40,
  },
});
