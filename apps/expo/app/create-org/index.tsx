import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import ExitWizardSheet from '@/components/ExitWizardSheet';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';

const STEPS = [
  { emoji: '🏪', title: 'Wähle deinen Typ', desc: 'Restaurant, Verein, Partei oder Unternehmen' },
  { emoji: '✏️', title: 'Erstelle dein Profil', desc: 'Name, Beschreibung, Fotos und Kontakt' },
  { emoji: '🚀', title: 'Werde sichtbar', desc: 'Nach Freigabe erscheint dein Profil in der App' },
];

export default function CreateOrgIntroScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [showExit, setShowExit] = useState(false);
  const { dispatch } = useCreateOrgWizard();

  const handleDelete = () => {
    dispatch({ type: 'RESET' });
    setShowExit(false);
    router.back();
  };

  const handleSaveAndExit = () => {
    setShowExit(false);
    router.back();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => setShowExit(true)} style={styles.closeButton}>
          <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Werde sichtbar{'\n'}in Röbel
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          In wenigen Schritten erstellst du dein Profil.
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
          onPress={() => router.push('/create-org/type')}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Los geht's</Text>
        </Pressable>
      </View>

      <ExitWizardSheet
        visible={showExit}
        onDelete={handleDelete}
        onSaveAndExit={handleSaveAndExit}
        onCancel={() => setShowExit(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 20,
    fontFamily: 'Inter-Regular',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 40,
  },
  stepsContainer: {
    gap: 12,
    marginBottom: 48,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  stepEmoji: {
    fontSize: 22,
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
