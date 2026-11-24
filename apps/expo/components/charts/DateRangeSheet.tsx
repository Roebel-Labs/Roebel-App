/** "Zeitraum" picker: Von / Bis, refuses end-before-start and ranges over 730 days. */
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { isValidCustomRange, MAX_RANGE_DAYS } from '@/lib/charts/ranges';

type Props = {
  visible: boolean;
  initial: { from: Date; to: Date };
  onClose: () => void;
  onApply: (r: { from: Date; to: Date }) => void;
};

const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DateRangeSheet({ visible, initial, onClose, onApply }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [editing, setEditing] = useState<'from' | 'to' | null>('from');
  const valid = isValidCustomRange(from, to);

  const onPick = (_: unknown, d?: Date) => {
    if (Platform.OS === 'android') setEditing(null);
    if (!d) return;
    if (editing === 'from') setFrom(d);
    else if (editing === 'to') setTo(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Schließen" />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Zeitraum wählen</Text>
        <View style={styles.row}>
          {(['from', 'to'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setEditing(k)}
              style={[
                styles.field,
                { borderColor: editing === k ? colors.textPrimary : colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{k === 'from' ? 'Von' : 'Bis'}</Text>
              <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{fmt(k === 'from' ? from : to)}</Text>
            </Pressable>
          ))}
        </View>
        {editing ? (
          <DateTimePicker
            value={editing === 'from' ? from : to}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={onPick}
            themeVariant={isDark ? 'dark' : 'light'}
            locale="de-DE"
          />
        ) : null}
        {!valid ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            „Bis“ muss nach „Von“ liegen, höchstens {MAX_RANGE_DAYS} Tage.
          </Text>
        ) : null}
        <Pressable
          disabled={!valid}
          onPress={() => onApply({ from, to })}
          style={[styles.apply, { backgroundColor: colors.textPrimary, opacity: valid ? 1 : 0.4 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.applyText, { color: colors.background }]}>Anwenden</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 14 },
  title: { fontFamily: fontFamily.heading, fontSize: 22 },
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12 },
  fieldLabel: { fontFamily: fontFamily.regular, fontSize: 12 },
  fieldValue: { fontFamily: fontFamily.semiBold, fontSize: 15, marginTop: 2 },
  hint: { fontFamily: fontFamily.regular, fontSize: 13 },
  apply: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});
