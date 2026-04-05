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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { supabase } from '@/lib/supabase';
import {
  fetchMenuCategories,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
} from '@/lib/supabase-menu';
import type { MenuCategoryRecord } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function MenuCategoriesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [categories, setCategories] = useState<MenuCategoryRecord[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAccount?.id) return;

    async function load() {
      const { data } = await supabase
        .from('restaurants')
        .select('id')
        .eq('account_id', activeAccount!.id)
        .maybeSingle();

      if (data) {
        setRestaurantId(data.id);
        const cats = await fetchMenuCategories(data.id);
        setCategories(cats);
      }
      setLoading(false);
    }
    load();
  }, [activeAccount?.id]);

  const handleAdd = async () => {
    if (!restaurantId || !newCategoryName.trim()) return;
    const cat = await createMenuCategory(restaurantId, newCategoryName.trim());
    if (cat) {
      setCategories(prev => [...prev, cat]);
      setNewCategoryName('');
    }
  };

  const handleToggleActive = async (cat: MenuCategoryRecord) => {
    const updated = !cat.is_active;
    setCategories(prev =>
      prev.map(c => (c.id === cat.id ? { ...c, is_active: updated } : c))
    );
    await updateMenuCategory(cat.id, { is_active: updated });
  };

  const handleDelete = async (categoryId: string) => {
    Alert.alert('Kategorie entfernen?', 'Alle Gerichte in dieser Kategorie werden ebenfalls gelöscht.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: async () => {
          await deleteMenuCategory(categoryId);
          setCategories(prev => prev.filter(c => c.id !== categoryId));
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Speisekarte</Text>
      </View>

      <ScrollView style={styles.scrollContent}>
        {/* Add new category */}
        <View style={styles.addRow}>
          <TextInput
            placeholder="Neue Kategorie (z.B. Vorspeisen)"
            placeholderTextColor={colors.textTertiary}
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            style={[styles.addInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          />
          <Pressable
            onPress={handleAdd}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.addBtnText, { color: colors.onPrimary }]}>+</Text>
          </Pressable>
        </View>

        {/* Category list */}
        {categories.map(cat => (
          <Pressable
            key={cat.id}
            onPress={() =>
              router.push({
                pathname: '/menu/[categoryId]',
                params: { categoryId: cat.id, restaurantId: restaurantId!, categoryName: cat.name },
              })
            }
            style={[styles.categoryRow, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.categoryName, { color: colors.textPrimary }]}>{cat.name}</Text>
            <View style={styles.categoryActions}>
              <Switch
                value={cat.is_active}
                onValueChange={() => handleToggleActive(cat)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.onPrimary}
              />
              <Pressable onPress={() => handleDelete(cat.id)}>
                <Text style={styles.deleteText}>Entfernen</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}

        {categories.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Noch keine Kategorien
          </Text>
        )}
      </ScrollView>
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
    fontFamily: 'Inter-Medium',
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  addRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  addInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  addBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  categoryRow: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    flex: 1,
    marginRight: 12,
  },
  categoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteText: {
    fontSize: 13,
    color: '#DC2626',
    fontFamily: 'Inter-Regular',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
});
