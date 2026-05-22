import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { MenuItemVariant } from '@/lib/types';
import {
  fetchMenuItemVariants,
  createMenuItemVariant,
  updateMenuItemVariant,
  deleteMenuItemVariant,
} from '@/lib/supabase-menu';

type Props = {
  menuItemId: string | null;
};

type Draft = {
  id?: string;
  name: string;
  price: string;
  is_default: boolean;
  sort_order: number;
  isNew?: boolean;
  isDirty?: boolean;
};

function toDraft(v: MenuItemVariant): Draft {
  return {
    id: v.id,
    name: v.name,
    price: String(v.price),
    is_default: v.is_default,
    sort_order: v.sort_order,
  };
}

export default function VariantsEditor({ menuItemId }: Props) {
  const { colors } = useTheme();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (!menuItemId) { setDrafts([]); return; }
    let cancelled = false;
    (async () => {
      const variants = await fetchMenuItemVariants(menuItemId);
      if (!cancelled) setDrafts(variants.map(toDraft));
    })();
    return () => { cancelled = true; };
  }, [menuItemId]);

  function update(idx: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch, isDirty: true } : d)));
  }

  function addRow() {
    setDrafts((prev) => [
      ...prev,
      { name: '', price: '0', is_default: prev.length === 0, sort_order: prev.length, isNew: true, isDirty: true },
    ]);
  }

  async function saveRow(idx: number) {
    if (!menuItemId) return;
    const d = drafts[idx];
    if (!d.name.trim()) return;
    const payload = {
      name: d.name.trim(),
      price: Number(d.price) || 0,
      is_default: d.is_default,
      sort_order: d.sort_order,
    };
    if (d.isNew) {
      const created = await createMenuItemVariant({ menu_item_id: menuItemId, ...payload });
      if (created) setDrafts((prev) => prev.map((p, i) => (i === idx ? { ...toDraft(created) } : p)));
    } else if (d.id) {
      await updateMenuItemVariant(d.id, payload);
      setDrafts((prev) => prev.map((p, i) => (i === idx ? { ...p, isDirty: false } : p)));
    }
  }

  async function removeRow(idx: number) {
    const d = drafts[idx];
    if (d.id && !d.isNew) await deleteMenuItemVariant(d.id);
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Größen / Varianten</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Optional. z. B. klein / groß oder 26 cm / 30 cm.
      </Text>
      {!menuItemId && (
        <Text style={[styles.hint, { color: colors.textTertiary, marginTop: 8 }]}>
          Speichere das Gericht zuerst, um Varianten hinzufügen zu können.
        </Text>
      )}

      {drafts.map((d, idx) => (
        <View key={d.id ?? `new-${idx}`} style={[styles.card, { borderColor: colors.borderSecondary }]}>
          <View style={styles.row}>
            <TextInput
              value={d.name}
              onChangeText={(t) => update(idx, { name: t })}
              placeholder="Name (z. B. klein)"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { flex: 2, color: colors.textPrimary, borderColor: colors.borderSecondary }]}
            />
            <TextInput
              value={d.price}
              onChangeText={(t) => update(idx, { price: t })}
              placeholder="Preis"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { flex: 1, color: colors.textPrimary, borderColor: colors.borderSecondary }]}
            />
          </View>
          <View style={styles.switchInline}>
            <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 13 }}>Standardvariante</Text>
            <Switch value={d.is_default} onValueChange={(v) => update(idx, { is_default: v })} />
          </View>
          <View style={styles.rowEnd}>
            {(d.isDirty || d.isNew) && menuItemId && (
              <Pressable onPress={() => saveRow(idx)} style={[styles.smallBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontFamily: 'Inter-Medium', fontSize: 13 }}>Speichern</Text>
              </Pressable>
            )}
            <Pressable onPress={() => removeRow(idx)} style={[styles.smallBtn, { borderWidth: 1, borderColor: colors.error }]}>
              <Text style={{ color: colors.error, fontFamily: 'Inter-Medium', fontSize: 13 }}>Entfernen</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {menuItemId && (
        <Pressable onPress={addRow} style={[styles.addBtn, { borderColor: colors.borderSecondary }]}>
          <Text style={{ color: colors.textPrimary, fontFamily: 'Inter-Medium' }}>+ Variante hinzufügen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingVertical: 8 },
  heading: { fontSize: 16, fontFamily: 'Inter-Medium' },
  hint: { fontSize: 12, fontFamily: 'Inter-Regular' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 8 },
  rowEnd: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  switchInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999 },
  addBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 4,
  },
});
