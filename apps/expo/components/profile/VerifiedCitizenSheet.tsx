import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';
import VerifiedBadge from '@/components/VerifiedBadge';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Explains the gold seal next to a username: the person is a verified
 * Röbel citizen (holds a Bürger-NFT confirmed by attesters + citizens).
 * Opened by tapping the seal on a profile.
 */
export default function VerifiedCitizenSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <VerifiedBadge size={64} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Verifizierte:r Bürger:in</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Das gelbe Siegel zeigt, dass diese Person als Bürger:in von Röbel/Müritz verifiziert ist.
          Bestehende Bescheiniger:innen und Bürger:innen haben die Identität und den Wohnsitz
          persönlich bestätigt.
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Verifizierte Bürger:innen können an Abstimmungen teilnehmen, Vorschläge einbringen und
          neue Mitglieder der Gemeinschaft bestätigen.
        </Text>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    textAlign: 'center',
    marginTop: 4,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    textAlign: 'center',
  },
});
