import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet, Alert } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { MenuItemRecord } from '@/lib/types';
import { createMenuItem, updateMenuItem, deleteMenuItem } from '@/lib/supabase-menu';
import MenuImageBlock from './MenuImageBlock';
import SidesEditor from './SidesEditor';
import VariantsEditor from './VariantsEditor';

type Props = {
  restaurantId: string;
  categoryId: string;
  item?: MenuItemRecord | null;
  onSaved: (item: MenuItemRecord) => void;
  onDeleted?: () => void;
};

export default function MenuItemEditor({ restaurantId, categoryId, item, onSaved, onDeleted }: Props) {
  const { colors } = useTheme();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '0');
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const [isVegetarian, setIsVegetarian] = useState(item?.is_vegetarian ?? false);
  const [isVegan, setIsVegan] = useState(item?.is_vegan ?? false);
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true);
  const [sidesRequired, setSidesRequired] = useState(item?.sides_required ?? false);
  const [sidesLabel, setSidesLabel] = useState(item?.sides_label ?? 'Wähle deine Beilage');
  const [variantsLabel, setVariantsLabel] = useState(item?.variants_label ?? 'Größe wählen');
  const [savedItemId, setSavedItemId] = useState<string | null>(item?.id ?? null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      Alert.alert('Name fehlt', 'Bitte gib einen Namen ein.');
      return;
    }
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice)) {
      Alert.alert('Preis ungültig', 'Bitte gib einen gültigen Preis ein.');
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: numericPrice,
      image_url: imageUrl,
      is_vegetarian: isVegetarian,
      is_vegan: isVegan,
      is_available: isAvailable,
      sides_required: sidesRequired,
      sides_label: sidesLabel.trim() || 'Wähle deine Beilage',
      variants_label: variantsLabel.trim() || 'Größe wählen',
    };
    if (savedItemId) {
      await updateMenuItem(savedItemId, payload);
      onSaved({ ...(item as MenuItemRecord), ...payload, id: savedItemId } as MenuItemRecord);
    } else {
      const created = await createMenuItem({
        restaurant_id: restaurantId,
        category_id: categoryId,
        ...payload,
      });
      if (created) {
        setSavedItemId(created.id);
        onSaved(created);
      }
    }
    setSaving(false);
  }

  async function remove() {
    if (!savedItemId) return;
    Alert.alert('Gericht löschen?', 'Das Gericht wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteMenuItem(savedItemId);
          onDeleted?.();
        },
      },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <MenuImageBlock
        menuItemId={savedItemId}
        restaurantId={restaurantId}
        imageUrl={imageUrl}
        onChange={setImageUrl}
      />

      <Text style={[styles.label, { color: colors.textPrimary }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="z. B. Pizza Margherita"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />

      <Text style={[styles.label, { color: colors.textPrimary }]}>Beschreibung</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="kurze Zutaten-/Stil-Beschreibung"
        placeholderTextColor={colors.textTertiary}
        multiline
        numberOfLines={3}
        style={[styles.input, styles.multiline, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />

      <Text style={[styles.label, { color: colors.textPrimary }]}>Basispreis (€)</Text>
      <TextInput
        value={price}
        onChangeText={setPrice}
        placeholder="9.00"
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Wird in der Liste als "ab €X" angezeigt, wenn Varianten existieren.
      </Text>

      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Sichtbar</Text>
        <Switch value={isAvailable} onValueChange={setIsAvailable} />
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Vegetarisch</Text>
        <Switch value={isVegetarian} onValueChange={setIsVegetarian} />
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Vegan</Text>
        <Switch value={isVegan} onValueChange={setIsVegan} />
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Beilage erforderlich</Text>
        <Switch value={sidesRequired} onValueChange={setSidesRequired} />
      </View>

      <Text style={[styles.label, { color: colors.textPrimary }]}>Beilagen-Überschrift</Text>
      <TextInput
        value={sidesLabel}
        onChangeText={setSidesLabel}
        placeholder="Wähle deine Beilage"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />

      <Text style={[styles.label, { color: colors.textPrimary }]}>Größen-Überschrift</Text>
      <TextInput
        value={variantsLabel}
        onChangeText={setVariantsLabel}
        placeholder="Größe wählen"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />

      <Pressable
        onPress={save}
        disabled={saving}
        style={[styles.btnPrimary, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}
      >
        <Text style={{ color: '#fff', fontFamily: 'Inter-Medium' }}>{saving ? 'Wird gespeichert…' : 'Gericht speichern'}</Text>
      </Pressable>

      <SidesEditor menuItemId={savedItemId} />
      <VariantsEditor menuItemId={savedItemId} />

      {savedItemId && (
        <Pressable onPress={remove} style={[styles.btnDanger, { borderColor: colors.error }]}>
          <Text style={{ color: colors.error, fontFamily: 'Inter-Medium' }}>Gericht löschen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { fontSize: 14, fontFamily: 'Inter-Medium', marginTop: 6 },
  hint: { fontSize: 12, fontFamily: 'Inter-Regular' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  btnPrimary: { paddingVertical: 14, borderRadius: 9999, alignItems: 'center', marginTop: 12 },
  btnDanger: { paddingVertical: 12, borderRadius: 9999, alignItems: 'center', borderWidth: 1, marginTop: 24 },
});
