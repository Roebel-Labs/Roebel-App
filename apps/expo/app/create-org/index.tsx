import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import ExitWizardSheet from '@/components/ExitWizardSheet';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';

const STEPS = [
  {
    title: 'Wähle deinen Typ',
    desc: 'Restaurant, Verein, Partei oder Unternehmen',
    illustration: require('@/assets/illustration/small/org.png'),
  },
  {
    title: 'Erstelle dein Profil',
    desc: 'Name, Beschreibung, Fotos und Kontakt',
    illustration: require('@/assets/illustration/small/fill-out.png'),
  },
  {
    title: 'Werde sichtbar',
    desc: 'Nach Freigabe erscheint dein Profil in der App',
    illustration: require('@/assets/illustration/small/mecky-thumbs-up.png'),
  },
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
          <Text style={[styles.closeIcon, { color: colors.textPrimary }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          So einfach sichtbar{'\n'}werden in Röbel
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
              <Image source={step.illustration} style={styles.stepIllustration} resizeMode="contain" />
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
  safeArea: { flex: 1 },
  headerRow: { paddingHorizontal: 24, paddingTop: 8 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 20, fontFamily: 'Inter-Regular' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  heading: { fontSize: 32, fontFamily: 'Inter-Bold', marginBottom: 32, lineHeight: 38 },
  stepsContainer: {},
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  stepNumber: { fontSize: 22, fontFamily: 'Inter-SemiBold', width: 24 },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  stepDesc: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 4, lineHeight: 19 },
  stepIllustration: { width: 64, height: 64 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  button: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
