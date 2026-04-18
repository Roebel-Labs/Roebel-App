import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWelcomeWizard, PreferredRole } from '@/context/WelcomeWizardContext';
import { useTheme } from '@/context/ThemeContext';
import WizardFooter from '@/components/WizardFooter';

const ROLES: { value: PreferredRole; emoji: string; label: string; desc: string }[] = [
  { value: 'buerger', emoji: '🏡', label: 'Bürger:in', desc: 'Ich wohne in Röbel.' },
  { value: 'tourist', emoji: '🧳', label: 'Tourist:in', desc: 'Ich besuche Röbel.' },
];

export default function WelcomeRoleScreen() {
  const router = useRouter();
  const { state, dispatch } = useWelcomeWizard();
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 2 von 4</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Was trifft auf dich zu?</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Wir zeigen dir passende Funktionen. Du kannst die Auswahl später ändern.
        </Text>

        <View style={styles.list}>
          {ROLES.map((role) => {
            const selected = state.preferredRole === role.value;
            return (
              <Pressable
                key={role.value}
                onPress={() => dispatch({ type: 'SET_ROLE', payload: role.value })}
                style={[
                  styles.card,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                    borderWidth: 2,
                  },
                ]}
              >
                <Text style={styles.cardEmoji}>{role.emoji}</Text>
                <View style={styles.cardText}>
                  <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{role.label}</Text>
                  <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{role.desc}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <WizardFooter
        step={2}
        totalSteps={4}
        onBack={() => router.back()}
        onNext={() => state.preferredRole && router.push('/welcome/features' as any)}
        nextDisabled={!state.preferredRole}
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    padding: 20,
  },
  cardEmoji: {
    fontSize: 32,
  },
  cardText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
