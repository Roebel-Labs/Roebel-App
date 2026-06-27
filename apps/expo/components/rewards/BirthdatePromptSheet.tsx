import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';

const DEFAULT_PICKER_DATE = new Date(1990, 0, 1);
const MIN_BIRTHDATE = new Date(1900, 0, 1);
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatGerman = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

interface BirthdatePromptSheetProps {
  visible: boolean;
  /** Close = cancel the action (no error). */
  onClose: () => void;
  /** Called with the canonical ISO `YYYY-MM-DD` birthdate once saved. */
  onSubmit: (isoDate: string) => void;
  /** Disable the save button + close while the parent persists the value. */
  saving?: boolean;
}

/**
 * Just-in-time birthdate prompt shown before a citizen can cast a vote when no
 * on-device birthdate exists yet. The birthdate is part of the citizen
 * commitment preimage — it stays on the device and is never shared publicly.
 */
export default function BirthdatePromptSheet({
  visible,
  onClose,
  onSubmit,
  saving = false,
}: BirthdatePromptSheetProps) {
  const { colors } = useTheme();
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSave = () => {
    if (!birthDate || saving) return;
    onSubmit(toIsoDate(birthDate));
  };

  // Android re-initialises a declaratively-rendered picker to its `value` on
  // every parent re-render (here, inside a BottomDrawer) — so flipping through
  // the calendar snaps back to the default date. Use the imperative API on
  // Android (a self-managed native dialog); keep the inline picker for iOS.
  const openPicker = () => {
    if (saving) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: birthDate ?? DEFAULT_PICKER_DATE,
        mode: 'date',
        display: 'default',
        maximumDate: new Date(),
        minimumDate: MIN_BIRTHDATE,
        onChange: (event, date) => {
          if (event.type === 'set' && date) setBirthDate(date);
        },
      });
    } else {
      setShowDatePicker(true);
    }
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Geburtsdatum bestätigen
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Für eine gültige Stimme brauchen wir dein Geburtsdatum — es ist Teil deines
          persönlichen Nachweises. Diese Angabe bleibt nur auf deinem Gerät und wird nicht
          öffentlich geteilt.
        </Text>

        <Pressable
          onPress={openPicker}
          style={[
            styles.dateField,
            { backgroundColor: colors.background, borderColor: colors.borderSecondary },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Geburtsdatum auswählen"
        >
          <Text style={[styles.dateText, { color: birthDate ? colors.textPrimary : colors.textTertiary }]}>
            {birthDate ? formatGerman(birthDate) : 'TT.MM.JJJJ'}
          </Text>
          <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
        </Pressable>

        {showDatePicker && Platform.OS === 'ios' && (
          <DateTimePicker
            value={birthDate ?? DEFAULT_PICKER_DATE}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            minimumDate={MIN_BIRTHDATE}
            onChange={(_event, date) => {
              if (date) setBirthDate(date);
            }}
          />
        )}

        <Pressable
          onPress={handleSave}
          disabled={!birthDate || saving}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: colors.primary,
              opacity: !birthDate || saving ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Geburtsdatum speichern"
        >
          <Text style={styles.ctaText}>{saving ? 'Wird gespeichert…' : 'Speichern'}</Text>
        </Pressable>

        <Pressable
          onPress={onClose}
          disabled={saving}
          style={styles.closeBtn}
          accessibilityRole="button"
        >
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>Abbrechen</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  headline: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  dateText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  cta: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: {
    color: '#fff',
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 16,
  },
  closeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
