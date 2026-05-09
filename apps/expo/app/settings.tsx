import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme, ThemePreference } from '@/context/ThemeContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CheckIcon from '@/assets/icons/check.svg';

const DATENSCHUTZ_URL = 'https://www.roebel.app/datenschutz';

type SectionProps = {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
};

function Section({ title, children, colors }: SectionProps) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>
        {children}
      </View>
    </View>
  );
}

type ThemeOptionProps = {
  label: string;
  description?: string;
  isSelected: boolean;
  onPress: () => void;
  isLast?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
};

function ThemeOption({ label, description, isSelected, onPress, isLast, colors }: ThemeOptionProps) {
  return (
    <Pressable
      style={[
        styles.themeOptionRow,
        !isLast ? { borderBottomWidth: 1, borderBottomColor: colors.borderSecondary } : undefined,
      ]}
      onPress={onPress}
    >
      <View style={styles.themeOptionTextContainer}>
        <Text style={[styles.themeOptionLabel, { color: colors.textPrimary }]}>{label}</Text>
        {description && (
          <Text style={[styles.themeOptionDescription, { color: colors.textSecondary }]}>
            {description}
          </Text>
        )}
      </View>
      {isSelected && <CheckIcon width={20} height={20} color={colors.primary} />}
    </Pressable>
  );
}

const themeOptions: { value: ThemePreference; label: string; description?: string }[] = [
  { value: 'system', label: 'System', description: 'Folgt den Geräteeinstellungen' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { preference, setPreference, colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Einstellungen</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false}>
        <Section title="ERSCHEINUNGSBILD" colors={colors}>
          {themeOptions.map((option, index) => (
            <ThemeOption
              key={option.value}
              label={option.label}
              description={option.description}
              isSelected={preference === option.value}
              onPress={() => setPreference(option.value)}
              isLast={index === themeOptions.length - 1}
              colors={colors}
            />
          ))}
        </Section>

        <Section title="WALLET" colors={colors}>
          <Pressable
            style={styles.themeOptionRow}
            onPress={() => router.push('/settings/reveal-key' as any)}
          >
            <View style={styles.themeOptionTextContainer}>
              <Text style={[styles.themeOptionLabel, { color: colors.textPrimary }]}>
                Privatschlüssel anzeigen
              </Text>
              <Text style={[styles.themeOptionDescription, { color: colors.textSecondary }]}>
                Nur mit biometrischer Bestätigung sichtbar.
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
        </Section>

        <Section title="DATENSCHUTZ" colors={colors}>
          <Pressable
            style={[
              styles.themeOptionRow,
              { borderBottomWidth: 1, borderBottomColor: colors.borderSecondary },
            ]}
            onPress={() => router.push('/settings/consent' as any)}
          >
            <View style={styles.themeOptionTextContainer}>
              <Text style={[styles.themeOptionLabel, { color: colors.textPrimary }]}>
                Datenschutz anpassen
              </Text>
              <Text style={[styles.themeOptionDescription, { color: colors.textSecondary }]}>
                Statistik, Mecky-KI, Karten und mehr einzeln steuern.
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
          <Pressable
            style={styles.themeOptionRow}
            onPress={() => {
              Linking.openURL(DATENSCHUTZ_URL).catch(() => {});
            }}
          >
            <View style={styles.themeOptionTextContainer}>
              <Text style={[styles.themeOptionLabel, { color: colors.textPrimary }]}>
                Datenschutzerklärung
              </Text>
              <Text style={[styles.themeOptionDescription, { color: colors.textSecondary }]}>
                Vollständige Erklärung im Browser öffnen.
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textTertiary }]}>↗</Text>
          </Pressable>
        </Section>

        <View style={styles.footerNote}>
          <Text style={[styles.footerNoteText, { color: colors.textTertiary }]}>
            Im Modus „System" passt sich die App automatisch an die Einstellungen Ihres Geräts an.
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
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
  headerSpacer: {
    width: 40,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  themeOptionTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  themeOptionLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  themeOptionDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  footerNote: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  footerNoteText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 40,
  },
  chevron: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
  },
});
