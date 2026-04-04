import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { ConnectEmbed } from 'thirdweb/react';
import { client, chain } from '@/constants/thirdweb';
import { inAppWallet } from 'thirdweb/wallets/in-app';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import * as Linking from 'expo-linking';

// Get the app's redirect URL for OAuth
const redirectUrl = Linking.createURL('/');

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function LoginDrawer({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();

  // Deferred to first render to avoid module-scope thirdweb evaluation (HMR warning)
  const wallets = useMemo(
    () => [
      inAppWallet({
        auth: {
          options: ['email', 'google', 'facebook', 'apple'],
          redirectUrl,
        },
        smartAccount: {
          chain,
          sponsorGas: true,
        },
      }),
    ],
    [],
  );

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.75}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>Jetzt freischalten</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Melden Sie sich an, um alle Funktionen zu nutzen
        </Text>

        {/* Thirdweb Connect Embed */}
        <View style={styles.connectContainer}>
          <ConnectEmbed
            client={client}
            autoConnect={false}
            theme={isDark ? "dark" : "light"}
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
        </View>

        {/* Additional Info */}
        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <Image
              source={require('@/assets/illustration/data-privacy.png')}
              style={styles.illustration}
              resizeMode="contain"
            />
            <View style={styles.infoTextContainer}>
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Privat und Sicher</Text>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Ihre Daten sind verschlüsselt und sicher
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <Image
              source={require('@/assets/illustration/pass.png')}
              style={styles.illustration}
              resizeMode="contain"
            />
            <View style={styles.infoTextContainer}>
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Bürgerabstimmungen testen</Text>

              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Nehmen Sie an Bürgerabstimmungen teil
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <Image
              source={require('@/assets/illustration/send.png')}
              style={styles.illustration}
              resizeMode="contain"
            />
            <View style={styles.infoTextContainer}>
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Veranstaltungen einsenden</Text>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Senden Sie Ihre Veranstaltung ein
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 24,
    textAlign: 'left',
  },
  connectContainer: {
    marginBottom: 32,
  },
  infoContainer: {
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  illustration: {
    width: 64,
    height: 64,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
