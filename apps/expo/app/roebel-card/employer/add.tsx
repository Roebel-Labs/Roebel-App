// Röbel Card — Add employee (single-screen form).

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { addEmployee } from '@/lib/supabase-roebel-card-employees';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function AddEmployeeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [label, setLabel] = useState('');
  const [monthlyTopup, setMonthlyTopup] = useState('50');
  const [autoTopup, setAutoTopup] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsedTopup = parseInt(monthlyTopup.replace(/\D/g, ''), 10);
  const topupValid = Number.isFinite(parsedTopup) && parsedTopup >= 0 && parsedTopup <= 50;
  const labelValid = label.trim().length > 0;
  const canSubmit = labelValid && topupValid && !submitting;

  const handleSubmit = async () => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      Alert.alert('Kein Unternehmensaccount', 'Bitte wechsle zu deinem Unternehmensaccount.');
      return;
    }
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const employee = await addEmployee({
        employerAccountId: activeAccount.id,
        employeeLabel: label.trim(),
        monthlyTopupCents: parsedTopup * 100,
        topupMode: autoTopup ? 'automatic' : 'manual',
      });
      router.replace({
        pathname: '/roebel-card/employer/invite/[code]',
        params: { code: employee.invite_code },
      } as any);
    } catch (err: any) {
      Alert.alert('Fehler', err?.message ?? 'Mitarbeiter konnte nicht hinzugefügt werden.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Mitarbeiter hinzufügen
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Name / Bezeichnung *</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Anna M. / Küche"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.textInput,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />
        <Text style={[styles.helper, { color: colors.textTertiary }]}>
          Frei wählbar. Wird deinen Mitarbeitern nur intern angezeigt.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}>
          Monatliches Guthaben (€) *
        </Text>
        <TextInput
          value={monthlyTopup}
          onChangeText={setMonthlyTopup}
          placeholder="50"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          style={[
            styles.textInput,
            {
              borderColor: topupValid ? colors.border : colors.error ?? '#DC2626',
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />
        <Text style={[styles.helper, { color: colors.textTertiary }]}>
          Maximal 50 € steuerfrei pro Monat (§8 Abs. 2 Satz 11 EStG).
        </Text>
        {!topupValid && (
          <Text style={[styles.helperError, { color: colors.error ?? '#DC2626' }]}>
            Bitte einen Betrag zwischen 0 und 50 € eingeben.
          </Text>
        )}

        <View style={[styles.toggleRow, { backgroundColor: colors.surface }]}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
              Automatisches Aufladen
            </Text>
            <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>
              Guthaben jeden Monat automatisch auffüllen
            </Text>
          </View>
          <Switch
            value={autoTopup}
            onValueChange={setAutoTopup}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[
            styles.submitButton,
            { backgroundColor: colors.primary },
            !canSubmit && { opacity: 0.5 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
              Einladung erstellen
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  label: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  helperError: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    gap: 12,
  },
  toggleText: { flex: 1 },
  toggleTitle: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  toggleSubtitle: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  submitButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
