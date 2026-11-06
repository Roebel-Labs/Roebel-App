// YouTube-style player settings: quality (read-only: expo-video picks the HLS rendition itself)
// and, for the replay only, playback speed.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LiveIcon from '@/components/live/LiveIcon';
import LiveSheet from './LiveSheet';
import { F, liveStyles, useLivePalette, type LivePalette } from './tokens';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Height of the rendition playing right now (null = unknown). */
  currentHeight: number | null;
  /** Distinct heights the stream offers, highest first. */
  availableHeights: number[];
  /** Replay only: speed control. */
  showSpeed: boolean;
  rate: number;
  onRate: (rate: number) => void;
};

function rateLabel(r: number): string {
  return r === 1 ? 'Normal' : `${String(r).replace('.', ',')}×`;
}

export default function PlayerSettingsSheet({ visible, onClose, currentHeight, availableHeights, showSpeed, rate, onRate }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const qualityValue = currentHeight ? `Auto (${currentHeight}p)` : 'Auto';
  const offered = availableHeights.length > 1 ? `Verfügbar: ${availableHeights.map((h) => `${h}p`).join(', ')}. ` : '';

  return (
    <LiveSheet visible={visible} onClose={onClose} title="Einstellungen" maxHeight="70%">
      <View style={styles.content}>
        <View style={styles.row}>
          <LiveIcon name="options-outline" size={20} color={L.text} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Qualität</Text>
            <Text style={styles.rowSub}>{`${offered}Passt sich automatisch an deine Verbindung an.`}</Text>
          </View>
          <Text style={styles.rowValue}>{qualityValue}</Text>
        </View>

        {showSpeed ? (
          <>
            <View style={[styles.row, styles.rowTop]}>
              <LiveIcon name="speedometer-outline" size={20} color={L.text} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Wiedergabegeschwindigkeit</Text>
              </View>
              <Text style={styles.rowValue}>{rateLabel(rate)}</Text>
            </View>
            <View style={styles.chips}>
              {PLAYBACK_RATES.map((r) => {
                const active = Math.abs(rate - r) < 0.01;
                return (
                  <Pressable
                    key={r}
                    onPress={() => onRate(r)}
                    style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.8 }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{rateLabel(r)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </View>
    </LiveSheet>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  rowTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border, marginTop: 4, paddingTop: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: L.text, fontSize: 15, fontFamily: F.semiBold },
  rowSub: { color: L.textTertiary, fontSize: 12, fontFamily: F.regular, lineHeight: 16 },
  rowValue: { color: L.textSecondary, fontSize: 14, fontFamily: F.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 64, height: 38, paddingHorizontal: 12, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.surfaceRaised,
  },
  chipActive: { backgroundColor: L.navy },
  chipText: { color: L.text, fontSize: 14, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
  chipTextActive: { color: L.onNavy },
});
