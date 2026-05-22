import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { MenuItemSide } from '@/lib/types';
import {
  fetchMenuItemSides,
  createMenuItemSide,
  updateMenuItemSide,
  deleteMenuItemSide,
} from '@/lib/supabase-menu';

type Props = {
  menuItemId: string | null;
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  price_delta: string;
  is_default: boolean;
  sort_order: number;
  isNew?: boolean;
  isDirty?: boolean;
};

function toDraft(s: MenuItemSide): Draft {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    price_delta: String(s.price_delta ?? 0),
    is_default: s.is_default,
    sort_order: s.sort_order,
  };
}

export default function SidesEditor({ menuItemId }: Props) {
  const { colors } = useTheme();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (!menuItemId) { setDrafts([]); return; }
    let cancelled = false;
    (async () => {
      const sides = await fetchMenuItemSides(menuItemId);
      if (!cancelled) setDrafts(sides.map(toDraft));
    })();
    return () => { cancelled = true; };
  }, [menuItemId]);

  function update(idx: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch, isDirty: true } : d)));
  }

  function addRow() {
    setDrafts((prev) => [
      ...prev,
      { name: '', description: '', price_delta: '0', is_default: prev.length === 0, sort_order: prev.length, isNew: true, isDirty: true },
    ]);
  }

  async function saveRow(idx: number) {
    if (!menuItemId) return;
    const d = drafts[idx];
    if (!d.name.trim()) return;
    const payload = {
      name: d.name.trim(),
      description: d.description.trim() || null,
      price_delta: Number(d.price_delta) || 0,
      is_default: d.is_default,
      sort_order: d.sort_order,
    };
    if (d.isNew) {
      const created = await createMenuItemSide({ menu_item_id: menuItemId, ...payload });
      if (created) setDrafts((prev) => prev.map((p, i) => (i === idx ? { ...toDraft(created) } : p)));
    } else if (d.id) {
      await updateMenuItemSide(d.id, payload);
      setDrafts((prev) => prev.map((p, i) => (i === idx ? { ...p, isDirty: false } : p)));
    }
  }

  async function removeRow(idx: number) {
    const d = drafts[idx];
    if (d.id && !d.isNew) await deleteMenuItemSide(d.id);
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Beilagen</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Optional. Erscheinen als Pflicht-Auswahl auf der Detailseite, wenn aktiviert.
      </Text>
      {!menuItemId && (
        <Text style={[styles.hint, { color: colors.textTertiary, marginTop: 8 }]}>
          Speichere das Gericht zuerst, um Beilagen hinzufügen zu können.
        </Text>
      )}

      {drafts.map((d, idx) => (
        <View key={d.id ?? `new-${idx}`} style={[styles.card, { borderColor: colors.borderSecondary }]}>
          <TextInput
            value={d.name}
            onChangeText={(t) => update(idx, { name: t })}
            placeholder="Name (z. B. Basmati-Reis)"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
          />
          <TextInput
            value={d.description}
            onChangeText={(t) => update(idx, { description: t })}
            placeholder="Beschreibung (optional)"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
          />
          <View style={styles.row}>
            <TextInput
              value={d.price_delta}
              onChangeText={(t) => update(idx, { price_delta: t })}
              placeholder="Aufpreis"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, styles.priceInput, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
            />
            <View style={styles.switchInline}>
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 13 }}>Standard</Text>
              <Switch value={d.is_default} onValueChange={(v) => update(idx, { is_default: v })} />
            </View>
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
          <Text style={{ color: colors.textPrimary, fontFamily: 'Inter-Medium' }}>+ Beilage hinzufügen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingVertical: 8 },
  heading: { fontSize: 16, fontFamily: 'Inter-Medium' },
  hint: { fontSize: 12, fontFamily: 'Inter-Regular' },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowEnd: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  priceInput: { flex: 1 },
  switchInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
