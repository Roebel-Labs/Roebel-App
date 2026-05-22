import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet, Alert } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { MenuCategoryRecord } from '@/lib/types';
import {
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
} from '@/lib/supabase-menu';

type Props = {
  restaurantId: string;
  category?: MenuCategoryRecord | null;
  onSaved: (cat: MenuCategoryRecord) => void;
  onDeleted?: () => void;
};

export default function CategoryEditor({ restaurantId, category, onSaved, onDeleted }: Props) {
  const { colors } = useTheme();
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(category?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      Alert.alert('Name fehlt', 'Bitte gib einen Kategorie-Namen ein.');
      return;
    }
    setSaving(true);
    if (category) {
      await updateMenuCategory(category.id, {
        name: name.trim(),
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      });
      onSaved({ ...category, name: name.trim(), sort_order: Number(sortOrder) || 0, is_active: isActive });
    } else {
      const created = await createMenuCategory(restaurantId, name.trim());
      if (created) {
        if (!isActive || Number(sortOrder) !== 0) {
          await updateMenuCategory(created.id, { sort_order: Number(sortOrder) || 0, is_active: isActive });
        }
        onSaved({ ...created, sort_order: Number(sortOrder) || 0, is_active: isActive });
      }
    }
    setSaving(false);
  }

  async function remove() {
    if (!category) return;
    Alert.alert('Kategorie löschen?', 'Alle Gerichte in dieser Kategorie werden ebenfalls gelöscht.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteMenuCategory(category.id);
          onDeleted?.();
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="z. B. Pizza"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />

      <Text style={[styles.label, { color: colors.textPrimary }]}>Reihenfolge</Text>
      <TextInput
        value={sortOrder}
        onChangeText={setSortOrder}
        placeholder="0"
        keyboardType="number-pad"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />

      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Sichtbar</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>

      <Pressable
        onPress={save}
        disabled={saving}
        style={[styles.btnPrimary, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}
      >
        <Text style={{ color: '#fff', fontFamily: 'Inter-Medium' }}>{saving ? 'Wird gespeichert…' : 'Speichern'}</Text>
      </Pressable>

      {category && (
        <Pressable onPress={remove} style={[styles.btnGhost, { borderColor: colors.error }]}>
          <Text style={{ color: colors.error, fontFamily: 'Inter-Medium' }}>Kategorie löschen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, paddingVertical: 8 },
  label: { fontSize: 14, fontFamily: 'Inter-Medium' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  btnPrimary: { paddingVertical: 14, borderRadius: 9999, alignItems: 'center', marginTop: 8 },
  btnGhost: { paddingVertical: 12, borderRadius: 9999, alignItems: 'center', borderWidth: 1 },
});
