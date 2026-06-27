import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Switch,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import {
  fetchMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from '@/lib/supabase-menu';
import { formatMenuPrice } from '@/lib/utils';
import type { MenuItemRecord } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PencilEditIcon from '@/assets/icons/pencil-edit-01.svg';
import PlusSignIcon from '@/assets/icons/plus-sign.svg';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 12;
const GRID_PAD = 16;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PAD * 2 - GRID_GAP) / 2;

type EditingItem = {
  id: string;
  name: string;
  price: string;
  description: string;
  is_vegetarian: boolean;
  is_vegan: boolean;
};

const EMPTY_FORM: Omit<EditingItem, 'id'> = {
  name: '',
  price: '',
  description: '',
  is_vegetarian: false,
  is_vegan: false,
};

export default function MenuItemsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { categoryId, restaurantId, categoryName } =
    useLocalSearchParams<{ categoryId: string; restaurantId: string; categoryName: string }>();

  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<EditingItem, 'id'>>(EMPTY_FORM);

  useEffect(() => {
    if (!categoryId) return;
    async function load() {
      const fetched = await fetchMenuItems(categoryId);
      setItems(fetched);
      setLoading(false);
    }
    load();
  }, [categoryId]);

  const openNewForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEditForm = (item: MenuItemRecord) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      price: String(item.price),
      description: item.description ?? '',
      is_vegetarian: item.is_vegetarian,
      is_vegan: item.is_vegan,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price.trim()) return;
    const priceNum = parseFloat(form.price.replace(',', '.'));
    if (isNaN(priceNum)) return;

    if (editingId) {
      await updateMenuItem(editingId, {
        name: form.name.trim(),
        price: priceNum,
        description: form.description.trim() || null,
        is_vegetarian: form.is_vegetarian,
        is_vegan: form.is_vegan,
      });
      setItems(prev =>
        prev.map(item =>
          item.id === editingId
            ? {
                ...item,
                name: form.name.trim(),
                price: priceNum,
                description: form.description.trim() || null,
                is_vegetarian: form.is_vegetarian,
                is_vegan: form.is_vegan,
              }
            : item
        )
      );
    } else {
      const created = await createMenuItem({
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: form.name.trim(),
        price: priceNum,
        description: form.description.trim() || null,
        is_vegetarian: form.is_vegetarian,
        is_vegan: form.is_vegan,
      });
      if (created) {
        setItems(prev => [...prev, created]);
      }
    }

    handleCancel();
  };

  const handleToggleAvailable = async (item: MenuItemRecord) => {
    const updated = !item.is_available;
    setItems(prev =>
      prev.map(i => (i.id === item.id ? { ...i, is_available: updated } : i))
    );
    await updateMenuItem(item.id, { is_available: updated });
  };

  const handleDelete = async (itemId: string) => {
    Alert.alert('Gericht entfernen?', 'Dieser Eintrag wird dauerhaft gelöscht.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: async () => {
          await deleteMenuItem(itemId);
          setItems(prev => prev.filter(i => i.id !== itemId));
          if (editingId === itemId) handleCancel();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBack}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {categoryName ?? 'Kategorie'}
          </Text>
        </View>

        <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Inline form */}
          {showForm && (
            <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
                {editingId ? 'Gericht bearbeiten' : 'Neues Gericht'}
              </Text>

              {/* Name */}
              <TextInput
                placeholder="Name *"
                placeholderTextColor={colors.textTertiary}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                style={[styles.formInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              />

              {/* Price */}
              <View style={styles.priceRow}>
                <TextInput
                  placeholder="Preis *"
                  placeholderTextColor={colors.textTertiary}
                  value={form.price}
                  onChangeText={v => setForm(f => ({ ...f, price: v }))}
                  keyboardType="decimal-pad"
                  style={[styles.formInput, styles.priceInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                />
                <View style={[styles.euroSuffix, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.euroText, { color: colors.textSecondary }]}>€</Text>
                </View>
              </View>

              {/* Description */}
              <TextInput
                placeholder="Beschreibung (optional)"
                placeholderTextColor={colors.textTertiary}
                value={form.description}
                onChangeText={v => setForm(f => ({ ...f, description: v }))}
                multiline
                numberOfLines={3}
                style={[styles.formInput, styles.descriptionInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              />

              {/* Diet toggles */}
              <View style={styles.dietRow}>
                <Pressable
                  onPress={() => setForm(f => ({ ...f, is_vegetarian: !f.is_vegetarian }))}
                  style={[
                    styles.dietToggle,
                    { borderColor: colors.border },
                    form.is_vegetarian && { backgroundColor: '#16a34a', borderColor: '#16a34a' },
                  ]}
                >
                  <Text style={[styles.dietToggleText, form.is_vegetarian && styles.dietToggleTextActive]}>
                    Vegetarisch
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setForm(f => ({ ...f, is_vegan: !f.is_vegan }))}
                  style={[
                    styles.dietToggle,
                    { borderColor: colors.border },
                    form.is_vegan && { backgroundColor: '#15803d', borderColor: '#15803d' },
                  ]}
                >
                  <Text style={[styles.dietToggleText, form.is_vegan && styles.dietToggleTextActive]}>
                    Vegan
                  </Text>
                </Pressable>
              </View>

              {/* Actions */}
              <View style={styles.formActions}>
                <Pressable
                  onPress={handleSave}
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
                    {editingId ? 'Aktualisieren' : 'Speichern'}
                  </Text>
                </Pressable>
                <Pressable onPress={handleCancel} style={styles.cancelBtn}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Abbrechen</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Item grid */}
          {!showForm && (
            <View style={styles.grid}>
              {items.map(item => (
                <View key={item.id} style={{ width: ITEM_WIDTH }}>
                  <Pressable
                    onPress={() => openEditForm(item)}
                    onLongPress={() => handleDelete(item.id)}
                    style={[styles.gridCard, { backgroundColor: colors.surface }]}
                  >
                    <View style={styles.gridCardContent}>
                      <Text style={[styles.gridCardName, { color: colors.textPrimary }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {(item.is_vegetarian || item.is_vegan) && (
                        <View style={styles.badgeRow}>
                          {item.is_vegetarian && (
                            <View style={[styles.badge, styles.badgeVeg]}>
                              <Text style={styles.badgeText}>V</Text>
                            </View>
                          )}
                          {item.is_vegan && (
                            <View style={[styles.badge, styles.badgeVegan]}>
                              <Text style={styles.badgeText}>VG</Text>
                            </View>
                          )}
                        </View>
                      )}
                      <Text style={[styles.gridCardPrice, { color: colors.textSecondary }]}>
                        {formatMenuPrice(item.price)}
                      </Text>
                    </View>
                    <View style={styles.gridCardFooter}>
                      {!item.is_available && (
                        <Text style={styles.unavailableLabel}>Aus</Text>
                      )}
                      <View style={styles.gridCardAction}>
                        <PencilEditIcon width={20} height={20} color={colors.primary} />
                      </View>
                    </View>
                  </Pressable>
                </View>
              ))}

              {/* "Neues Gericht" add card */}
              <View style={{ width: ITEM_WIDTH }}>
                <Pressable
                  onPress={openNewForm}
                  style={[styles.gridCard, styles.gridCardDashed, { borderColor: colors.border }]}
                >
                  <Text style={[styles.gridCardAddLabel, { color: colors.textSecondary }]}>
                    Neues Gericht
                  </Text>
                  <View style={[styles.gridCardActionFilled, { backgroundColor: colors.primary }]}>
                    <PlusSignIcon width={20} height={20} color={colors.onPrimary} />
                  </View>
                </Pressable>
              </View>
            </View>
          )}

          {items.length === 0 && showForm && (
            <Text style={[styles.emptyText, { color: colors.textTertiary, marginTop: 8 }]}>
              Erstelle dein erstes Gericht
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerBack: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    flex: 1,
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  formCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  formTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  formInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 0,
  },
  priceInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  euroSuffix: {
    borderWidth: 1,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  euroText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  dietRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dietToggle: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dietToggleText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6b7280',
  },
  dietToggleTextActive: {
    color: '#ffffff',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  cancelBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCard: {
    borderRadius: 12,
    padding: 14,
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 140,
  },
  gridCardDashed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gridCardContent: {
    gap: 4,
  },
  gridCardName: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    lineHeight: 21,
  },
  gridCardPrice: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  gridCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  gridCardAction: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  gridCardActionFilled: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCardAddLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  unavailableLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#DC2626',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeVeg: {
    backgroundColor: '#16a34a',
  },
  badgeVegan: {
    backgroundColor: '#15803d',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
});
