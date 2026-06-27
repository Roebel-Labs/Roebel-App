/**
 * Read-only audit history of consent changes for the current device.
 * Pulled from `consent_audit_log` via ConsentContext.fetchHistory.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useConsent } from '@/context/ConsentContext';
import { CONSENT_CATEGORIES } from '@/constants/consent';
import type { AuditLogEntry } from '@/lib/consent-supabase';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const SOURCE_LABEL: Record<string, string> = {
  first_launch: 'Erstes Öffnen',
  customize_screen: 'Einstellungen',
  reconsent: 'Update bestätigt',
  banner: 'Banner-Aktion',
  banner_dismissed: 'Banner geschlossen',
  migration: 'Migration',
  reconcile: 'Wallet-Verknüpfung',
  welcome_terms: 'Onboarding',
};

export default function ConsentHistoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { fetchHistory } = useConsent();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(50).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchHistory]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Audit-Verlauf</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.lede, { color: colors.textSecondary }]}>
          Jede Änderung deiner Datenschutz-Einstellungen wird hier protokolliert (Art. 7 Abs. 1
          DSGVO).
        </Text>

        {entries === null && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {entries !== null && entries.length === 0 && (
          <Text style={[styles.empty, { color: colors.textTertiary }]}>
            Noch keine Einträge.
          </Text>
        )}

        {entries?.map((entry) => (
          <View
            key={entry.id}
            style={[styles.entry, { borderBottomColor: colors.border }]}
          >
            <View style={styles.entryRow}>
              <Text style={[styles.entryCategory, { color: colors.textPrimary }]}>
                {labelFor(entry.category)}
              </Text>
              <Text style={[styles.entryValue, { color: colors.textSecondary }]}>
                {valueLabel(entry.previous_value, entry.new_value)}
              </Text>
            </View>
            <View style={styles.entryRow}>
              <Text style={[styles.entryMeta, { color: colors.textTertiary }]}>
                {SOURCE_LABEL[entry.source] ?? entry.source}
              </Text>
              <Text style={[styles.entryMeta, { color: colors.textTertiary }]}>
                {formatDate(entry.created_at)}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function labelFor(category: string): string {
  if (category === '__migration__') return 'Migration auf v1.0';
  if (category === '__reconcile__') return 'Wallet-Verknüpfung';
  return CONSENT_CATEGORIES.find((c) => c.id === category)?.title ?? category;
}

function valueLabel(prev: boolean | null, next: boolean | null): string {
  if (prev === null && next === null) return '';
  const left = prev === null ? '–' : prev ? 'an' : 'aus';
  const right = next === null ? '–' : next ? 'an' : 'aus';
  return `${left} → ${right}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  lede: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    marginBottom: 16,
  },
  loading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  empty: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    paddingVertical: 32,
    textAlign: 'center',
  },
  entry: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryCategory: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  entryValue: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  entryMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  bottomSpacer: { height: 40 },
});
