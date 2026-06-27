import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, Linking } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  onAccept: () => void;
};

export default function MapPrivacyConsent({ onAccept }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Image
          source={require('@/assets/illustration/data-privacy.png')}
          style={styles.illustration}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Kartenfunktion</Text>

        <Text style={[styles.description, { color: colors.tabIconActive }]}>
          Um die Kartenfunktion nutzen zu können, müssen Sie unsere Datenschutzbestimmungen
          akzeptieren.
        </Text>

        <Text style={[styles.description, { color: colors.tabIconActive }]}>
          Die Karte verwendet Mapbox, was die Verarbeitung von Standortdaten und anderen
          Informationen beinhalten kann.
        </Text>

        <Pressable
          onPress={() => Linking.openURL('https://www.roebel.app/datenschutz')}
          style={styles.linkContainer}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>
            Vollständige Datenschutzerklärung lesen →
          </Text>
        </Pressable>

        <Pressable
          style={[styles.acceptButton, { backgroundColor: colors.tabIconActive }]}
          onPress={onAccept}
        >
          <Text style={[styles.acceptButtonText, { color: colors.textInverted }]}>
            Akzeptieren und fortfahren
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 1000,
  },
  content: {
    maxWidth: 400,
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  illustration: {
    width: 200,
    height: 200,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    lineHeight: 24,
  },
  linkContainer: {
    paddingVertical: 8,
    marginTop: 4,
  },
  linkText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  acceptButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  acceptButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
