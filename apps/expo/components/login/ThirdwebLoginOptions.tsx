/**
 * The standard sign-in options (Google, Facebook, E-Mail …) from thirdweb's ConnectEmbed, plus
 * the three illustrated benefit rows. Shared by the login bottom sheet (components/LoginDrawer)
 * and the Anmelden screen (app/welcome), so both show exactly the same thing.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ConnectEmbed } from 'thirdweb/react';
import { client, chain } from '@/constants/thirdweb';
import { wallets } from '@/constants/wallets';
import { useTheme } from '@/context/ThemeContext';

export function ThirdwebLoginOptions() {
  const { isDark } = useTheme();
  return (
    <ConnectEmbed
      client={client}
      autoConnect={false}
      theme={isDark ? 'dark' : 'light'}
      chain={chain}
      wallets={wallets}
      showThirdwebBranding={false}
      locale={{
        signInWithEmail: 'Mit E-Mail anmelden',
        emailPlaceholder: 'E-Mail-Adresse',
        submitEmail: 'Weiter',
        emailRequired: 'E-Mail-Adresse ist erforderlich',
        invalidEmail: 'Ungültige E-Mail-Adresse',
        verifyCodePlaceholder: 'Bestätigungscode eingeben',
        verifyCodeLabel: 'Geben Sie den Code ein, den Sie per E-Mail erhalten haben',
        verifyCodeButton: 'Bestätigen',
        resendCode: 'Code erneut senden',
      }}
    />
  );
}

const BENEFITS = [
  {
    image: require('@/assets/illustration/small/encryption.png'),
    title: 'Privat und Sicher',
    text: 'Ihre Daten sind verschlüsselt und sicher',
  },
  {
    image: require('@/assets/illustration/small/coin-stack.png'),
    title: 'Tägliche Münzen erhalten',
    text: 'Kaufe Schlüssel und öffne Truhen',
  },
  {
    image: require('@/assets/illustration/small/mecky-thumbs-up.png'),
    title: 'Kommuniziere mit Mecky',
    text: 'Mecky hilft dir bei allen Fragen zu Röbel',
  },
];

export function LoginBenefits() {
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {BENEFITS.map((b) => (
        <View key={b.title} style={styles.item}>
          <Image source={b.image} style={styles.illustration} resizeMode="contain" />
          <View style={styles.texts}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{b.title}</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>{b.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  illustration: { width: 64, height: 64 },
  texts: { flex: 1 },
  title: { fontSize: 16, fontFamily: 'MonaSans-Medium', marginBottom: 4 },
  text: { fontSize: 14, fontFamily: 'MonaSans-Regular' },
});
