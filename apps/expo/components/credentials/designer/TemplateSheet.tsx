/** "Vorlagen": every template drawn live, plus an empty card. Picking one replaces the design (undo brings it back). */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TEMPLATES, type CardDesign, type CardTemplate } from '@roebel/card-design';
import BottomDrawer from '@/components/BottomDrawer';
import DesignedCard from '@/components/credentials/DesignedCard';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

export const EMPTY_CARD: CardDesign = {
  schema: 1,
  format: 'card',
  background: { kind: 'preset', preset: 'matte' },
  shine: { enabled: false, intensity: 0.5 },
  layers: [],
};

export function TemplateGrid({ onPick, width }: { onPick: (t: CardTemplate | null) => void; width: number }) {
  const { colors } = useTheme();
  const tile = Math.floor((width - 12) / 2);
  return (
    <View style={styles.grid}>
      {TEMPLATES.map((t) => (
        <Pressable key={t.id} onPress={() => onPick(t)} style={[styles.tile, { width: tile }]} accessibilityRole="button" accessibilityLabel={`Vorlage ${t.label}`}>
          <DesignedCard design={t.design} width={t.format === 'stamp' ? Math.round(tile * 0.63) : tile} mode="preview" animate="static" />
          <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>{t.label}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => onPick(null)} style={[styles.tile, { width: tile }]} accessibilityRole="button" accessibilityLabel="Leere Karte">
        <View style={[styles.empty, { width: tile, height: Math.round((tile * 580) / 924), borderColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>Leere Karte</Text>
      </Pressable>
    </View>
  );
}

export default function TemplateSheet({ visible, onClose, onPick, width }: {
  visible: boolean; onClose: () => void; onPick: (design: CardDesign, templateId: string | null) => void; width: number;
}) {
  const { colors } = useTheme();
  return (
    <BottomDrawer visible={visible} onClose={onClose} maxSnapPoint={0.9}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Vorlagen</Text>
      <ScrollView>
        <TemplateGrid width={width} onPick={(t) => { onPick(t ? t.design : EMPTY_CARD, t ? t.id : null); onClose(); }} />
      </ScrollView>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: fontFamily.heading, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 24 },
  tile: { gap: 6, alignItems: 'center' },
  label: { fontSize: 13, fontFamily: fontFamily.medium },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 8 },
});
