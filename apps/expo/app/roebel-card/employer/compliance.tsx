// Röbel Card — Employer §8 EStG compliance documentation list.
//
// Shows one row per month (from roebel_card_compliance) with the total
// Sachbezug issued, employee count, and a tap target to download the
// compliance PDF generated server-side by the admin dashboard. Empty
// state when no PDFs have been generated yet.
//
// In-scope for session 4 session bonus: list + download only. PDF
// generation itself is a server-side job that runs outside the app.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import {
  fetchComplianceByEmployer,
  type ComplianceRow,
} from '@/lib/supabase-roebel-card-compliance';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const MONTH_LABELS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-account' }
  | { kind: 'ready'; rows: ComplianceRow[] };

export default function ComplianceListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      setLoadState({ kind: 'no-account' });
      return;
    }
    const rows = await fetchComplianceByEmployer(activeAccount.id);
    setLoadState({ kind: 'ready', rows });
  }, [activeAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleOpenPdf = async (row: ComplianceRow) => {
    if (!row.compliance_pdf_url) {
      Alert.alert(
        'PDF noch nicht verfügbar',
        'Das Dokument für diesen Monat wird vom Admin erstellt, sobald alle Zahlungen verbucht sind.',
      );
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(row.compliance_pdf_url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        dismissButtonStyle: 'close',
      });
    } catch (err) {
      console.error('openBrowserAsync error:', err);
      Alert.alert('Fehler', 'Das Dokument konnte nicht geöffnet werden.');
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
          §8 EStG Dokumentation
        </Text>
        <View style={styles.headerButton} />
      </View>

      {loadState.kind === 'loading' ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadState.kind === 'no-account' ? (
        <View style={styles.centerFill}>
          <Text style={styles.stateEmoji}>🏢</Text>
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
            Kein Unternehmensaccount aktiv
          </Text>
        </View>
      ) : loadState.rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.stateEmoji}>🧾</Text>
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
            Noch keine Dokumentation
          </Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            Sobald du Sachbezug-Zahlungen an Mitarbeiter ausgezahlt hast, erscheinen
            hier monatliche Steuerunterlagen zum Download. Die Dokumente werden
            automatisch vom Admin erstellt.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Monatliche Belege ({loadState.rows.length})
          </Text>

          {loadState.rows.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => handleOpenPdf(row)}
              style={[styles.row, { backgroundColor: colors.surface }]}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
                  {MONTH_LABELS[row.month - 1]} {row.year}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {formatEuros(row.total_issued_cents)} · {row.employee_count}{' '}
                  {row.employee_count === 1 ? 'Mitarbeiter' : 'Mitarbeiter'}
                </Text>
              </View>
              <Text
                style={[
                  styles.rowAction,
                  {
                    color: row.compliance_pdf_url ? colors.primary : colors.textTertiary,
                  },
                ]}
              >
                {row.compliance_pdf_url ? 'PDF ›' : 'Ausstehend'}
              </Text>
            </Pressable>
          ))}

          <Text style={[styles.legal, { color: colors.textTertiary }]}>
            Die Dokumente bestätigen, dass die Röbel Card als Sachbezug gemäß
            §8 Abs. 2 Satz 11 EStG (bis 50 € / Mitarbeiter / Monat) steuerfrei
            ausgegeben wurde.
          </Text>
        </ScrollView>
      )}
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
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  scrollContent: { padding: 16, paddingBottom: 48 },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  stateEmoji: { fontSize: 56, marginBottom: 8 },
  stateTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionHeading: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  rowLeft: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  rowMeta: { fontSize: 12, fontFamily: 'Inter-Regular' },
  rowAction: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  legal: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 16,
    paddingHorizontal: 16,
  },
});
