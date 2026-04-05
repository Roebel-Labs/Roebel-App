import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateOrgWizard, OrgTypeChoice } from '@/context/CreateOrgWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';

const ORG_TYPES: { value: OrgTypeChoice; emoji: string; label: string; desc: string }[] = [
  { value: 'restaurant', emoji: '🍽️', label: 'Restaurant', desc: 'Gastronomie mit Speisekarte' },
  { value: 'unternehmen', emoji: '🏪', label: 'Unternehmen', desc: 'Gewerbe & Dienstleistungen' },
  { value: 'verein', emoji: '🤝', label: 'Verein', desc: 'Sport, Kultur, Soziales' },
  { value: 'partei', emoji: '🏛️', label: 'Partei', desc: 'Politische Parteien' },
  { value: 'fraktion', emoji: '⚖️', label: 'Fraktion', desc: 'Fraktionen im Stadtrat' },
];

export default function CreateOrgTypeScreen() {
  const router = useRouter();
  const { state, dispatch } = useCreateOrgWizard();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 1</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Welcher Typ passt?
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Wähle die Kategorie, die deine Organisation am besten beschreibt.
        </Text>

        <View style={styles.grid}>
          {ORG_TYPES.map((org) => {
            const selected = state.orgType === org.value;
            return (
              <Pressable
                key={org.value}
                onPress={() => dispatch({ type: 'SET_ORG_TYPE', payload: org.value })}
                style={[
                  styles.card,
                  selected
                    ? { borderColor: colors.primary, backgroundColor: colors.surface, borderWidth: 2 }
                    : { borderColor: colors.border, backgroundColor: colors.surface, borderWidth: 2 },
                ]}
              >
                <Text style={styles.cardEmoji}>{org.emoji}</Text>
                <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{org.label}</Text>
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{org.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <WizardFooter
        step={1}
        onBack={() => router.back()}
        onNext={() => state.orgType && router.push('/create-org/info')}
        nextDisabled={!state.orgType}
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
    paddingHorizontal: 24,
    paddingTop: 24,
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
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
  },
  cardEmoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
});
