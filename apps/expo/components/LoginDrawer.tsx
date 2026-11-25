import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LoginBenefits, ThirdwebLoginOptions } from '@/components/login/ThirdwebLoginOptions';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import PasskeyEntryLinks from '@/components/passkey/PasskeyEntryLinks';
import PasskeySignInOption from '@/components/passkey/PasskeySignInOption';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The welcome screen shows "Unabhängiges Konto" itself; don't offer it twice. */
  hidePasskey?: boolean;
};

export default function LoginDrawer({ visible, onClose, hidePasskey = false }: Props) {
  const { colors } = useTheme();

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

        {/* Passkey "Unabhängiges Konto" — renders nothing unless the preview gate is open */}
        {!hidePasskey && <PasskeySignInOption onSignedIn={onClose} onNavigate={onClose} />}

        <View style={styles.connectContainer}>
          <ThirdwebLoginOptions />
        </View>
        <PasskeyEntryLinks onNavigate={onClose} />

        <LoginBenefits />
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
    fontFamily: 'MonaSans-Medium',
    marginBottom: 8,
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
    marginBottom: 24,
    textAlign: 'left',
  },
  connectContainer: {
    marginBottom: 32,
  },
});
