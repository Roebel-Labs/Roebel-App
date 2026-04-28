import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateDealWizard } from '@/context/CreateDealWizardContext';
import { useUser } from '@/context/UserContext';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import ExitWizardSheet from '@/components/ExitWizardSheet';

const STEPS = [
  {
    title: 'Wähle die Art',
    desc: 'Rabatt, Event oder Neues Produkt',
    illustration: require('@/assets/illustration/small/sale-tag.png'),
  },
  {
    title: 'Beschreibe dein Angebot',
    desc: 'Titel, Details und Bild',
    illustration: require('@/assets/illustration/small/fill-out.png'),
  },
  {
    title: 'Sofort oder später',
    desc: 'Entwurf speichern oder direkt aktiv',
    illustration: require('@/assets/illustration/small/mecky-thumbs-up.png'),
  },
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
          <Text style={[styles.closeIcon, { color: colors.textPrimary }]}>{'✕'}</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        <View>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            So einfach erstellst du{'\n'}ein Angebot
          </Text>

          <View style={styles.stepsContainer}>
            {STEPS.map((step, i) => (
              <View
                key={i}
                style={[
                  styles.stepRow,
                  i < STEPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.stepNumber, { color: colors.textPrimary }]}>{i + 1}</Text>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
                </View>
                <View style={styles.stepIllustrationBox}>
                  <Image source={step.illustration} style={styles.stepIllustration} resizeMode="contain" />
                </View>
              </View>
            ))}
          </View>
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
  heading: { fontSize: 32, fontFamily: 'Inter-Bold', marginBottom: 32, lineHeight: 38 },
  stepsContainer: {},
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  stepNumber: { fontSize: 16, fontFamily: 'Inter-SemiBold', width: 24, alignSelf: 'flex-start', paddingTop: 4 },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 17, fontFamily: 'Inter-Medium' },
  stepDesc: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 4, lineHeight: 19 },
  stepIllustrationBox: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
  stepIllustration: { width: 80, height: 80 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  button: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
