import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateDealWizard } from '@/context/CreateDealWizardContext';
import { useUser } from '@/context/UserContext';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import ExitWizardSheet from '@/components/ExitWizardSheet';

const STEPS = [
  { emoji: '\u{1F3F7}\u{FE0F}', title: 'W\u00E4hle die Art', desc: 'Rabatt, Event oder Neues Produkt' },
  { emoji: '\u270F\u{FE0F}', title: 'Beschreibe dein Angebot', desc: 'Titel, Details und Bild' },
  { emoji: '\u{1F4C5}', title: 'Sofort oder sp\u00E4ter', desc: 'Entwurf speichern oder direkt aktiv' },
];

export default function CreateDealIntroScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [showExit, setShowExit] = useState(false);
  const { dispatch } = useCreateDealWizard();
  const { user } = useUser();

  // Auto-resolve business on mount
  useEffect(() => {
    if (user?.wallet_address) {
      fetchBusinessesByOwner(user.wallet_address).then(businesses => {
        const primary = businesses.find(b => b.status === 'approved') || businesses[0];
        if (primary) dispatch({ type: 'SET_BUSINESS_ID', payload: primary.id });
      });
    }
  }, [user?.wallet_address]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => setShowExit(true)} style={styles.closeButton}>
          <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>{'\u2715'}</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Erstelle ein{'\n'}Angebot
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Erreiche deine Kunden in R\u00F6bel mit einem Angebot.
        </Text>

        <View style={styles.stepsContainer}>
          {STEPS.map((step, i) => (
            <View key={i} style={[styles.stepCard, { borderColor: colors.border }]}>
              <Text style={styles.stepEmoji}>{step.emoji}</Text>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{`${i + 1}. ${step.title}`}</Text>
                <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/create-deal/type')}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Los geht's</Text>
        </Pressable>
      </View>

      <ExitWizardSheet
        visible={showExit}
        onDelete={() => {
          dispatch({ type: 'RESET' });
          setShowExit(false);
          router.back();
        }}
        onSaveAndExit={() => {
          setShowExit(false);
          router.back();
        }}
        onCancel={() => setShowExit(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerRow: { paddingHorizontal: 24, paddingTop: 8 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 20, fontFamily: 'Inter-Regular' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  heading: { fontSize: 28, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subheading: { fontSize: 16, fontFamily: 'Inter-Regular', marginBottom: 40 },
  stepsContainer: { gap: 12, marginBottom: 48 },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  stepEmoji: { fontSize: 22 },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  stepDesc: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  button: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
