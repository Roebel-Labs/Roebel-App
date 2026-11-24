/**
 * "Abzeichen erstellen" for organisations: coming soon (the AI badge designer follows). Until then
 * it points to what already works: a badge for the participants of an event.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import PressableScale from '@/components/PressableScale';
import { CredentialScreenFrame } from '@/components/credentials/CredentialScreenFrame';

const ILLUSTRATION = require('@/assets/illustration/badges/badge_cards.webp');

export default function CreateBadgeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <CredentialScreenFrame title="Abzeichen erstellen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" accessible={false} />
        <View style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.chipText, { color: colors.primary }]}>Bald verfügbar</Text>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Eigene Abzeichen gestalten</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Bald gestaltet ihr hier mit KI eigene Abzeichen für eure Veranstaltungen, Mitglieder und Ehrenamtliche, im Stil der
          Röbel-Abzeichen.
        </Text>
        <View style={[styles.note, { borderColor: colors.border }]}>
          <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>Schon jetzt möglich</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Schaltet beim Anlegen oder Bearbeiten einer Veranstaltung „Abzeichen für Teilnehmende“ ein. Gäste scannen den
            QR-Code am Eingang und bekommen das Abzeichen in ihre Sammlung.
          </Text>
        </View>
        <PressableScale
          onPress={() => router.push('/submit-event' as any)}
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel="Veranstaltung anlegen"
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Veranstaltung anlegen</Text>
        </PressableScale>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, alignItems: 'center' },
  illustration: { width: 260, height: 198, marginBottom: 20 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  title: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 30, textAlign: 'center', marginBottom: 8 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  note: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 24, gap: 6 },
  noteTitle: { fontFamily: fontFamily.semiBold, fontSize: 15, textAlign: 'center' },
  button: { alignSelf: 'stretch', borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});
