import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { supabase } from '@/lib/supabase';
import { fetchRestaurantTables, createRestaurantTable, deleteRestaurantTable } from '@/lib/supabase-orders';
import type { RestaurantTable } from '@/lib/types/orders';
import TableQRCode from '@/components/kitchen/TableQRCode';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function TableManagementScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAccount?.id) return;

    async function load() {
      const { data } = await supabase
        .from('restaurants')
        .select('id, slug')
        .eq('account_id', activeAccount!.id)
        .maybeSingle();

      if (data) {
        setRestaurantId(data.id);
        setRestaurantSlug(data.slug);
        const tbl = await fetchRestaurantTables(data.id);
        setTables(tbl);
      }
      setLoading(false);
    }
    load();
  }, [activeAccount?.id]);

  const handleAdd = async () => {
    if (!restaurantId || !newTableNumber.trim()) return;
    const table = await createRestaurantTable(restaurantId, newTableNumber.trim());
    if (table) {
      setTables(prev => [...prev, table]);
      setNewTableNumber('');
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

  const selectedTableObj = tables.find(t => t.id === selectedTable);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tische verwalten</Text>
      </View>

      <ScrollView style={styles.scrollContent}>
        {/* Add new table */}
        <View style={styles.addRow}>
          <TextInput
            placeholder="Tischnummer (z.B. 1, Terrasse 2)"
            placeholderTextColor={colors.textTertiary}
            value={newTableNumber}
            onChangeText={setNewTableNumber}
            style={[styles.addInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          />
          <Pressable
            onPress={handleAdd}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.addBtnText, { color: colors.onPrimary }]}>+</Text>
          </Pressable>
        </View>

        {/* Table list */}
        {tables.map(table => (
          <Pressable
            key={table.id}
            onPress={() => setSelectedTable(selectedTable === table.id ? null : table.id)}
            style={[styles.tableRow, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.tableNumber, { color: colors.textPrimary }]}>Tisch {table.table_number}</Text>
            <View style={styles.tableActions}>
              <Text style={[styles.qrLabel, { color: colors.primary }]}>QR</Text>
              <Pressable onPress={() => handleDelete(table.id)}>
                <Text style={styles.deleteText}>Entfernen</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}

        {/* QR code preview */}
        {selectedTableObj && restaurantSlug && (
          <View style={[styles.qrContainer, { backgroundColor: colors.surface }]}>
            <TableQRCode slug={restaurantSlug} tableNumber={selectedTableObj.table_number} />
          </View>
        )}

        {tables.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Noch keine Tische angelegt
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
  },
  addBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addBtnText: {
    fontFamily: 'Inter-Medium',
  },
  tableRow: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableNumber: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  tableActions: {
    flexDirection: 'row',
    gap: 12,
  },
  qrLabel: {
    fontSize: 13,
  },
  deleteText: {
    fontSize: 13,
    color: '#DC2626',
  },
  qrContainer: {
    marginTop: 16,
    borderRadius: 14,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
  },
});
