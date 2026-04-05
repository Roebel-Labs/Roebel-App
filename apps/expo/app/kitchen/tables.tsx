import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
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
        .eq('status', 'published')
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
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const selectedTableObj = tables.find(t => t.id === selectedTable);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tische verwalten</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Add new table */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <TextInput
            placeholder="Tischnummer (z.B. 1, Terrasse 2)"
            placeholderTextColor={colors.textTertiary}
            value={newTableNumber}
            onChangeText={setNewTableNumber}
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary }}
          />
          <Pressable
            onPress={handleAdd}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: 'Inter-Medium' }}>+</Text>
          </Pressable>
        </View>

        {/* Table list */}
        {tables.map(table => (
          <Pressable
            key={table.id}
            onPress={() => setSelectedTable(selectedTable === table.id ? null : table.id)}
            style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tisch {table.table_number}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ fontSize: 13, color: colors.primary }}>QR</Text>
              <Pressable onPress={() => handleDelete(table.id)}>
                <Text style={{ fontSize: 13, color: '#DC2626' }}>Entfernen</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}

        {/* QR code preview */}
        {selectedTableObj && restaurantSlug && (
          <View style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: 14 }}>
            <TableQRCode slug={restaurantSlug} tableNumber={selectedTableObj.table_number} />
          </View>
        )}

        {tables.length === 0 && (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>
            Noch keine Tische angelegt
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
