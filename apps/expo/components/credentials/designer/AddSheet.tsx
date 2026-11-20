/**
 * "Hinzufügen": Oberfläche (finishes, "Foto wählen", card-wide Glanz), Logo, Text, Feld, Sticker.
 * Pictures come from the photo library and are uploaded as org images first; a failed upload
 * leaves the design unchanged and shows the server's message.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  LOGO_SLOT_ASSET, PRESET_IDS, PRESETS, addLayer, designSize, newLayerId,
  type CardDesign, type FieldId, type FieldLayer, type ImageLayer, type PresetId, type TextLayer,
} from '@roebel/card-design';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { AssetKind, AssetView, DesignResult } from '@/lib/credreg/designs';

export const PRESET_LABELS: Record<PresetId, string> = {
  silver: 'Silber', navy: 'Navy', gold: 'Gold', black: 'Schwarz', paper: 'Papier', holo: 'Holografisch', matte: 'Matt', glass: 'Glas',
};
const FIELD_LABELS: Record<FieldId, { label: string; sample: string }> = {
  holderName: { label: 'Vor- und Nachname', sample: 'Vorname Nachname' },
  validUntil: { label: 'Gültig bis', sample: '31.12.2027' },
  memberSince: { label: 'Mitglied seit', sample: '01.01.2025' },
};

type Upload = (kind: AssetKind) => Promise<DesignResult<AssetView> | null>;

const base = { rotation: 0, opacity: 1, shine: false } as const;

function inkFor(d: CardDesign): string {
  return d.background.kind === 'preset' ? PRESETS[d.background.preset].ink : '#FFFFFF';
}

export function textLayer(d: CardDesign): TextLayer {
  const { w, h } = designSize(d.format);
  return { ...base, id: newLayerId(d), type: 'text', x: w * 0.1, y: h * 0.42, w: w * 0.8, h: 56, text: 'Neuer Text', font: 'mona-bold', size: 40, color: inkFor(d), align: 'left', uppercase: false, letterSpacing: 0 };
}

export function fieldLayer(d: CardDesign, field: FieldId): FieldLayer {
  const { w, h } = designSize(d.format);
  return { ...base, id: newLayerId(d), type: 'field', field, sampleText: FIELD_LABELS[field].sample, x: w * 0.06, y: h * 0.68, w: w * 0.65, h: 44, font: 'mona-bold', size: 30, color: inkFor(d), align: 'left', uppercase: false, letterSpacing: 0 };
}

export function imageLayer(d: CardDesign, assetId: string, role: ImageLayer['role'], img?: { width: number | null; height: number | null }): ImageLayer {
  const { w, h } = designSize(d.format);
  const boxW = role === 'logo' ? w * 0.2 : w * 0.25;
  const ratio = img?.width && img?.height ? img.height / img.width : 1;
  const boxH = Math.min(h * 0.4, boxW * ratio);
  return { ...base, id: newLayerId(d), type: 'image', x: (w - boxW) / 2, y: (h - boxH) / 2, w: boxW, h: boxH, assetId, role };
}

/** The org logo: fills the template's empty logo slot when there is one, else a new layer. */
export function placeLogo(d: CardDesign, asset: AssetView): CardDesign {
  const slot = d.layers.find((l) => l.type === 'image' && (l.assetId === LOGO_SLOT_ASSET || l.role === 'logo'));
  if (slot) return { ...d, layers: d.layers.map((l) => (l.id === slot.id ? { ...l, assetId: asset.sha } as ImageLayer : l)) };
  return addLayer(d, imageLayer(d, asset.sha, 'logo', asset));
}

type Props = {
  visible: boolean;
  onClose: () => void;
  design: CardDesign;
  apply: (fn: (d: CardDesign) => CardDesign, select?: (d: CardDesign) => string | null) => void;
  upload: Upload;
};

export default function AddSheet({ visible, onClose, design, apply, upload }: Props) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<AssetKind | null>(null);

  const withUpload = async (kind: AssetKind, then: (a: AssetView) => void) => {
    if (busy) return;
    setBusy(kind);
    try {
      const res = await upload(kind);
      if (!res) return; // cancelled
      if (!res.ok) {
        Alert.alert('Bild nicht hochgeladen', res.message);
        return;
      }
      then(res.data);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ label, onPress, kind }: { label: string; onPress: () => void; kind?: AssetKind }) => (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[styles.rowText, { color: colors.textPrimary }]}>{label}</Text>
      {kind && busy === kind ? <ActivityIndicator color={colors.primary} /> : null}
    </Pressable>
  );

  return (
    <BottomDrawer visible={visible} onClose={onClose} maxSnapPoint={0.9}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.section, { color: colors.textSecondary }]}>Oberfläche</Text>
        <View style={styles.swatches}>
          {PRESET_IDS.map((p) => {
            const active = design.background.kind === 'preset' && design.background.preset === p;
            return (
              <Pressable
                key={p}
                onPress={() => apply((d) => ({ ...d, background: { kind: 'preset', preset: p } }))}
                style={styles.swatchWrap}
                accessibilityRole="button"
                accessibilityLabel={`Oberfläche ${PRESET_LABELS[p]}`}
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.swatch, { backgroundColor: PRESETS[p].stops[1], borderColor: active ? colors.primary : colors.border }]} />
                <Text style={[styles.swatchText, { color: colors.textSecondary }]}>{PRESET_LABELS[p]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Row
          label="Foto wählen"
          kind="background"
          onPress={() => withUpload('background', (a) => apply((d) => ({ ...d, background: { kind: 'image', assetId: a.sha, fit: 'cover' } })))}
        />
        <View style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[styles.rowText, { color: colors.textPrimary }]}>Glanz über die ganze Karte</Text>
          <Switch
            value={design.shine.enabled}
            onValueChange={(v) => apply((d) => ({ ...d, shine: { ...d.shine, enabled: v } }))}
            accessibilityLabel="Glanz über die ganze Karte"
          />
        </View>

        <Text style={[styles.section, { color: colors.textSecondary }]}>Logo</Text>
        <Row label="Logo wählen" kind="logo" onPress={() => withUpload('logo', (a) => apply((d) => placeLogo(d, a)))} />

        <Text style={[styles.section, { color: colors.textSecondary }]}>Text</Text>
        <Row label="Text hinzufügen" onPress={() => { apply((d) => addLayer(d, textLayer(d)), (d) => d.layers[d.layers.length - 1]?.id ?? null); onClose(); }} />

        <Text style={[styles.section, { color: colors.textSecondary }]}>Feld</Text>
        {(Object.keys(FIELD_LABELS) as FieldId[]).map((f) => (
          <Row key={f} label={FIELD_LABELS[f].label} onPress={() => { apply((d) => addLayer(d, fieldLayer(d, f)), (d) => d.layers[d.layers.length - 1]?.id ?? null); onClose(); }} />
        ))}

        <Text style={[styles.section, { color: colors.textSecondary }]}>Sticker</Text>
        <Row
          label="Sticker wählen"
          kind="sticker"
          onPress={() => withUpload('sticker', (a) => apply((d) => addLayer(d, imageLayer(d, a.sha, 'sticker', a)), (d) => d.layers[d.layers.length - 1]?.id ?? null))}
        />
      </ScrollView>
    </BottomDrawer>
  );
}

/** Picks one image from the library; null when cancelled or not allowed. */
export async function pickImage(): Promise<{ uri: string; mime: string; size: number | null } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Kein Zugriff auf Fotos', 'Bitte erlaube den Zugriff auf deine Fotos in den Einstellungen.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (res.canceled || !res.assets.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null };
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 8 },
  section: { fontSize: 13, fontFamily: fontFamily.semiBold, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatchWrap: { alignItems: 'center', gap: 4, width: 64 },
  swatch: { width: 48, height: 32, borderRadius: 6, borderWidth: 2 },
  swatchText: { fontSize: 12, fontFamily: fontFamily.regular },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 48 },
  rowText: { fontSize: 15, fontFamily: fontFamily.medium },
});
