import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';

type Feature = { emoji: string; title: string; desc: string };

const FEATURES_BY_ROLE: Record<'buerger' | 'tourist', { heading: string; features: Feature[] }> = {
  buerger: {
    heading: 'Das kannst du als Bürger:in tun',
    features: [
      { emoji: '💳', title: 'Röbel Card', desc: 'Profitiere von Angeboten lokaler Partner.' },
      { emoji: '🛍️', title: 'Marktplatz', desc: 'Kaufe, verkaufe und tausche in der Nachbarschaft.' },
      { emoji: '🗳️', title: 'Bürger-Abstimmungen', desc: 'Entscheide mit über wichtige Themen in Röbel.' },
      { emoji: '🎉', title: 'Events entdecken', desc: 'Veranstaltungen und Termine immer im Blick.' },
    ],
  },
  tourist: {
    heading: 'Das kannst du als Tourist:in erleben',
    features: [
      { emoji: '💳', title: 'Röbel Card', desc: 'Rabatte und Extras bei lokalen Partnern.' },
      { emoji: '🧭', title: 'Entdecken', desc: 'Sehenswürdigkeiten, Orte und Insider-Tipps.' },
      { emoji: '🎉', title: 'Events', desc: 'Konzerte, Märkte und Veranstaltungen.' },
      { emoji: '🛍️', title: 'Marktplatz', desc: 'Stöbere durch regionale Angebote.' },
    ],
  },
};

export default function WelcomeFeaturesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state } = useWelcomeWizard();

  const role = state.preferredRole ?? 'tourist';
  const { heading, features } = FEATURES_BY_ROLE[role];

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 3 von 4</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>{heading}</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Ein Überblick deiner wichtigsten Funktionen in Röbel.
        </Text>

        <View style={styles.list}>
          {features.map((f) => (
            <View key={f.title} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={styles.emoji}>{f.emoji}</Text>
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{f.title}</Text>
                <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <WizardFooter
        step={3}
        totalSteps={4}
        onBack={() => router.back()}
        onNext={() => router.push('/welcome/consent' as any)}
        nextLabel="Weiter"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heading: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
    lineHeight: 22,
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  textWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
});
