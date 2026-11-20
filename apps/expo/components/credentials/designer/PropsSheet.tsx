/**
 * Settings of the selected layer: text (or sample text of a field), font, size, colour,
 * alignment, capitals, letter spacing, opacity, rotation, "Glanz", order and delete.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  FONT_IDS, FONT_LABELS, MAX_TEXT, moveLayer, removeLayer, updateLayer,
  type CardDesign, type Layer, type LayerPatch,
} from '@roebel/card-design';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

const COLORS = ['#FFFFFF', '#0A0A0A', '#00498B', '#6B787B', '#B8892E', '#C0392B', '#2E7D32', '#F5E6C8'];
const FIELD_NAMES = { holderName: 'Vor- und Nachname', validUntil: 'Gültig bis', memberSince: 'Mitglied seit' } as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  layer: Layer | null;
  apply: (fn: (d: CardDesign) => CardDesign) => void;
  onDeleted: () => void;
};

export default function PropsSheet({ visible, onClose, layer, apply, onDeleted }: Props) {
  const { colors } = useTheme();
  if (!layer) return null;
  const id = layer.id;
  const patch = (p: LayerPatch) => apply((d) => updateLayer(d, id, p));
  const isText = layer.type !== 'image';

  const Stepper = ({ label, value, onChange, step, min, max, format }: {
    label: string; value: number; onChange: (v: number) => void; step: number; min: number; max: number; format?: (v: number) => string;
  }) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(Math.max(min, value - step))} style={[styles.stepBtn, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`${label} verringern`}>
          <Text style={[styles.stepText, { color: colors.textPrimary }]}>−</Text>
        </Pressable>
        <Text style={[styles.value, { color: colors.textPrimary }]}>{format ? format(value) : Math.round(value)}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + step))} style={[styles.stepBtn, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`${label} erhöhen`}>
          <Text style={[styles.stepText, { color: colors.textPrimary }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <BottomDrawer visible={visible} onClose={onClose} maxSnapPoint={0.85} keyboardAware>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {layer.type === 'text' ? 'Text' : layer.type === 'field' ? FIELD_NAMES[layer.field] : layer.role === 'logo' ? 'Logo' : layer.role === 'sticker' ? 'Sticker' : 'Bild'}
        </Text>

        {layer.type === 'text' ? (
          <TextInput
            value={layer.text}
            onChangeText={(text) => patch({ text: text.slice(0, MAX_TEXT) })}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            accessibilityLabel="Text"
          />
        ) : null}
        {layer.type === 'field' ? (
          <>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Jedes Mitglied sieht hier seine eigenen Angaben. Der Beispieltext erscheint nur in der Vorschau.
            </Text>
            <TextInput
              value={layer.sampleText}
              onChangeText={(sampleText) => patch({ sampleText: sampleText.slice(0, MAX_TEXT) })}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              accessibilityLabel="Beispieltext"
            />
          </>
        ) : null}

        {isText ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FONT_IDS.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => patch({ font: f })}
                  style={[styles.chip, { borderColor: layer.font === f ? colors.primary : colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Schrift ${FONT_LABELS[f]}`}
                  accessibilityState={{ selected: layer.font === f }}
                >
                  <Text style={[styles.chipText, { color: colors.textPrimary }]}>{FONT_LABELS[f]}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Stepper label="Größe" value={layer.size} step={2} min={8} max={160} onChange={(size) => patch({ size })} />
            <View style={styles.colors}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => patch({ color: c })}
                  style={[styles.color, { backgroundColor: c, borderColor: layer.color.toUpperCase().startsWith(c) ? colors.primary : colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Farbe ${c}`}
                />
              ))}
            </View>
            <View style={styles.chips}>
              {(['left', 'center', 'right'] as const).map((a) => (
                <Pressable
                  key={a}
                  onPress={() => patch({ align: a })}
                  style={[styles.chip, { borderColor: layer.align === a ? colors.primary : colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={a === 'left' ? 'Links' : a === 'center' ? 'Mittig' : 'Rechts'}
                >
                  <Text style={[styles.chipText, { color: colors.textPrimary }]}>{a === 'left' ? 'Links' : a === 'center' ? 'Mittig' : 'Rechts'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.row, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Großbuchstaben</Text>
              <Switch value={layer.uppercase} onValueChange={(uppercase) => patch({ uppercase })} accessibilityLabel="Großbuchstaben" />
            </View>
            <Stepper label="Zeichenabstand" value={layer.letterSpacing} step={0.02} min={-0.1} max={0.5} format={(v) => v.toFixed(2)} onChange={(letterSpacing) => patch({ letterSpacing })} />
          </>
        ) : null}

        <Stepper label="Deckkraft" value={layer.opacity} step={0.1} min={0.1} max={1} format={(v) => `${Math.round(v * 100)} %`} onChange={(opacity) => patch({ opacity: Math.round(opacity * 10) / 10 })} />
        <Stepper label="Drehung" value={layer.rotation} step={5} min={-180} max={180} format={(v) => `${Math.round(v)}°`} onChange={(rotation) => patch({ rotation })} />
        <View style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Glanz</Text>
          <Switch value={layer.shine} onValueChange={(shine) => patch({ shine })} accessibilityLabel="Glanz" />
        </View>

        <View style={styles.chips}>
          {([['up', 'Nach vorne'], ['down', 'Nach hinten']] as const).map(([to, label]) => (
            <Pressable key={to} onPress={() => apply((d) => moveLayer(d, id, to))} style={[styles.chip, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={label}>
              <Text style={[styles.chipText, { color: colors.textPrimary }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => { apply((d) => removeLayer(d, id)); onDeleted(); }}
          style={[styles.delete, { borderColor: colors.error }]}
          accessibilityRole="button"
          accessibilityLabel="Entfernen"
        >
          <Text style={[styles.deleteText, { color: colors.error }]}>Entfernen</Text>
        </Pressable>
      </ScrollView>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 10 },
  title: { fontSize: 18, fontFamily: fontFamily.heading },
  hint: { fontSize: 13, fontFamily: fontFamily.regular },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 16, fontFamily: fontFamily.regular },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 14, fontFamily: fontFamily.medium },
  colors: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  color: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 48 },
  label: { fontSize: 15, fontFamily: fontFamily.medium },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontFamily: fontFamily.semiBold },
  value: { minWidth: 52, textAlign: 'center', fontSize: 14, fontFamily: fontFamily.medium },
  delete: { borderWidth: 1.5, borderRadius: 12, alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  deleteText: { fontSize: 15, fontFamily: fontFamily.semiBold },
});
