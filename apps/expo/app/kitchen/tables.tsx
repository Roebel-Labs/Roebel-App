import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { supabase } from '@/lib/supabase';
import { fetchRestaurantTables, createRestaurantTable, deleteRestaurantTable } from '@/lib/supabase-orders';
import { createRestaurant } from '@/lib/supabase-restaurants';
import type { RestaurantTable } from '@/lib/types/orders';
import TableQRCode from '@/components/kitchen/TableQRCode';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PlusSignIcon from '@/assets/icons/plus-sign.svg';
import BorderFullIcon from '@/assets/icons/border-full.svg';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 12;
const GRID_PAD = 16;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PAD * 2 - GRID_GAP) / 2;

export default function TableManagementScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRestaurant = async () => {
    if (!activeAccount?.id) return;
    setError(null);
    setLoading(true);

    const { data } = await supabase
      .from('restaurants')
      .select('id, slug')
      .eq('account_id', activeAccount.id)
      .maybeSingle();

    if (data) {
      setRestaurantId(data.id);
      setRestaurantSlug(data.slug);
      const tbl = await fetchRestaurantTables(data.id);
      setTables(tbl);
    } else {
      try {
        const restaurant = await createRestaurant({
          name: activeAccount.name,
          account_id: activeAccount.id,
        });
        setRestaurantId(restaurant.id);
        setRestaurantSlug(restaurant.slug);
      } catch (e) {
        console.error('Failed to create restaurant:', e);
        setError('Restaurant konnte nicht eingerichtet werden.');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRestaurant();
  }, [activeAccount?.id]);

  const handleAdd = async () => {
    if (!restaurantId || !newTableNumber.trim()) return;
    const table = await createRestaurantTable(restaurantId, newTableNumber.trim());
    if (table) {
      setTables(prev => [...prev, table]);
      setNewTableNumber('');
      setShowAddInput(false);
    } else {
      Alert.alert('Fehler', 'Tisch konnte nicht erstellt werden.');
    }
  };

  const handleDelete = async (tableId: string) => {
    Alert.alert('Tisch entfernen?', 'Der QR-Code wird ungültig.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: async () => {
          await deleteRestaurantTable(tableId);
          setTables(prev => prev.filter(t => t.id !== tableId));
          if (selectedTable === tableId) setSelectedTable(null);
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

  if (error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{error}</Text>
        <Pressable
          onPress={loadRestaurant}
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.retryBtnText, { color: colors.onPrimary }]}>Erneut versuchen</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const selectedTableObj = tables.find(t => t.id === selectedTable);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tische verwalten</Text>
      </View>

      <KeyboardAwareScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled" enableOnAndroid enableAutomaticScroll extraScrollHeight={100} extraHeight={150}>
        {/* Inline add input */}
        {showAddInput && (
          <View style={styles.addRow}>
            <TextInput
              placeholder="Tischnummer (z.B. 1, Terrasse 2)"
              placeholderTextColor={colors.textTertiary}
              value={newTableNumber}
              onChangeText={setNewTableNumber}
              onSubmitEditing={handleAdd}
              autoFocus
              style={[styles.addInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            />
            <Pressable onPress={handleAdd} style={[styles.addInputBtn, { backgroundColor: colors.primary }]}>
              <Text style={[styles.addInputBtnText, { color: colors.onPrimary }]}>Hinzufügen</Text>
            </Pressable>
          </View>
        )}

        {/* Table grid */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>TISCHE</Text>
        <View style={styles.grid}>
          {tables.map(table => (
            <View key={table.id} style={{ width: ITEM_WIDTH }}>
              <Pressable
                onPress={() => setSelectedTable(selectedTable === table.id ? null : table.id)}
                style={[styles.gridCard, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.gridCardNumber, { color: colors.textPrimary }]}>
                  {table.table_number}
                </Text>
                <View style={styles.gridCardFooter}>
                  <Pressable
                    onPress={() => handleDelete(table.id)}
                    style={styles.gridCardAction}
                  >
                    <BorderFullIcon width={20} height={20} color="#DC2626" />
                  </Pressable>
                </View>
              </Pressable>
            </View>
          ))}

          {/* "Neuer Tisch" add card */}
          <View style={{ width: ITEM_WIDTH }}>
            <Pressable
              onPress={() => setShowAddInput(true)}
              style={[styles.gridCard, styles.gridCardDashed, { borderColor: colors.border }]}
            >
              <Text style={[styles.gridCardAddLabel, { color: colors.textSecondary }]}>
                Neuer Tisch
              </Text>
              <View style={[styles.gridCardActionFilled, { backgroundColor: colors.primary }]}>
                <PlusSignIcon width={20} height={20} color={colors.onPrimary} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* QR code preview */}
        {selectedTableObj && restaurantSlug && (
          <View style={[styles.qrContainer, { backgroundColor: colors.surface }]}>
            <TableQRCode slug={restaurantSlug} tableNumber={selectedTableObj.table_number} />
          </View>
        )}
      </KeyboardAwareScrollView>
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
    padding: GRID_PAD,
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
  addInputBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addInputBtnText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
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
    alignItems: 'center',
    minHeight: 140,
  },
  gridCardDashed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    gap: 12,
  },
  gridCardNumber: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    marginTop: 16,
  },
  gridCardFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
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
  qrContainer: {
    marginTop: 20,
    borderRadius: 14,
  },
  retryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
});
