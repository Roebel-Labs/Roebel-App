/**
 * Customize consent screen — granular per-purpose toggles.
 * Save-on-toggle (debounced via ConsentContext). Withdrawal symmetry: toggling
 * off is exactly one tap, no confirmation alert (Art. 7(3) DSGVO).
 */

import React from 'react';
import {
  Linking,
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
import { CONSENT_CATEGORIES, PRIVACY_POLICY_VERSION } from '@/constants/consent';
import { ConsentCategoryRow } from '@/components/consent/ConsentCategoryRow';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const DATENSCHUTZ_URL = 'https://www.roebel.app/datenschutz';

export default function CustomizeConsentScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, setPreference, acceptAll, rejectAll } = useConsent();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Datenschutz</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.lede, { color: colors.textSecondary }]}>
          Steuere für jeden Zweck einzeln, welche Daten verarbeitet werden dürfen. Änderungen
          werden sofort gespeichert.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {CONSENT_CATEGORIES.map((category) => (
            <ConsentCategoryRow
              key={category.id}
              category={category}
              value={preferences[category.id]}
              onChange={(next) => setPreference(category.id, next)}
            />
          ))}
        </View>

        <View style={styles.bulkActions}>
          <Pressable
            onPress={() => acceptAll('customize_screen')}
            style={[styles.bulkPrimary, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.bulkPrimaryLabel, { color: colors.onPrimary }]}>
              Alle akzeptieren
            </Text>
          </Pressable>
          <Pressable
            onPress={() => rejectAll('customize_screen')}
            style={[styles.bulkSecondary, { borderColor: colors.borderSecondary }]}
          >
            <Text style={[styles.bulkSecondaryLabel, { color: colors.textPrimary }]}>
              Alle ablehnen
            </Text>
          </Pressable>
        </View>

        <View style={styles.metaBlock}>
          <Text style={[styles.metaLine, { color: colors.textTertiary }]}>
            Datenschutz-Version: {PRIVACY_POLICY_VERSION}
          </Text>
          <Pressable
            onPress={() => router.push('/settings/consent/history' as any)}
            accessibilityRole="link"
          >
            <Text style={[styles.metaLink, { color: colors.link }]}>Audit-Verlauf anzeigen ›</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(DATENSCHUTZ_URL)}
            accessibilityRole="link"
          >
            <Text style={[styles.metaLink, { color: colors.link }]}>
              Vollständige Datenschutzerklärung ›
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
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
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  lede: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: 16,
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  bulkPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  bulkPrimaryLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  bulkSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  bulkSecondaryLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  metaBlock: {
    marginTop: 24,
    gap: 8,
  },
  metaLine: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  metaLink: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  bottomSpacer: { height: 40 },
});
