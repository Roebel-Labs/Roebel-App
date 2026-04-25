/**
 * Detail / "Mehr erfahren" screen for one consent category.
 * Shows the full DSGVO disclosure: purpose, lawful basis, processors,
 * retention, third-country transfer note, and a link to the processor's policy.
 */

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useConsent } from '@/context/ConsentContext';
import { CONSENT_CATEGORIES, type ConsentCategoryId } from '@/constants/consent';
import { CustomToggle } from '@/components/consent/CustomToggle';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function ConsentCategoryDetailScreen() {
  const { category: categoryParam } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, setPreference } = useConsent();

  const category = CONSENT_CATEGORIES.find((c) => c.id === categoryParam);

  if (!category) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Unbekannte Kategorie
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>
    );
  }

  const value = preferences[category.id as ConsentCategoryId];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {category.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.toggleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
              {category.title} {value ? 'aktiviert' : 'deaktiviert'}
            </Text>
            <Text style={[styles.togglePurpose, { color: colors.textSecondary }]}>
              {category.oneLineDe}
            </Text>
          </View>
          <CustomToggle
            value={value}
            onChange={(next) =>
              setPreference(category.id as ConsentCategoryId, next, 'customize_screen')
            }
            disabled={category.isLocked}
          />
        </View>

        <Section title="Zweck" colors={colors}>
          <Text style={[styles.body, { color: colors.textPrimary }]}>{category.detailDe}</Text>
        </Section>

        <Section title="Rechtsgrundlage" colors={colors}>
          <Text style={[styles.body, { color: colors.textPrimary }]}>{category.legalBasis}</Text>
        </Section>

        <Section title="Verarbeitende Stellen" colors={colors}>
          {category.processors.map((p, i) => (
            <View key={i} style={styles.processorRow}>
              <Text style={[styles.processorName, { color: colors.textPrimary }]}>{p.name}</Text>
              <Text style={[styles.processorRegion, { color: colors.textTertiary }]}>
                {regionLabel(p.region)}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="Speicherdauer" colors={colors}>
          <Text style={[styles.body, { color: colors.textPrimary }]}>{category.retention}</Text>
        </Section>

        {hasUsTransfer(category) && (
          <Section title="Übermittlung in Drittländer" colors={colors}>
            <Text style={[styles.body, { color: colors.textPrimary }]}>
              Eine Übermittlung in die USA erfolgt auf Basis der EU-Standardvertragsklauseln (SCCs)
              und des EU-US Data Privacy Framework (DPF). Mehr dazu in unserer{' '}
              <Text style={{ color: colors.link }}>Datenschutzerklärung</Text>.
            </Text>
          </Section>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function regionLabel(region: 'EU' | 'USA' | 'Multi' | 'Device'): string {
  switch (region) {
    case 'EU':
      return 'Europäische Union';
    case 'USA':
      return 'Vereinigte Staaten';
    case 'Device':
      return 'Lokal auf deinem Gerät';
    case 'Multi':
    default:
      return 'Mehrere Regionen';
  }
}

function hasUsTransfer(c: { processors: { region: string }[] }): boolean {
  return c.processors.some((p) => p.region === 'USA');
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
    maxWidth: 240,
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    marginBottom: 16,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  togglePurpose: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: {
    gap: 6,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
  processorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  processorName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  processorRegion: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  bottomSpacer: { height: 40 },
});
