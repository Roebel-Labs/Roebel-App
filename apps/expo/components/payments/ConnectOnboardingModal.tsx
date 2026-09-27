// In-app Stripe onboarding (KYB) for an org's connected account.
//
// Renders Stripe's Connect "account onboarding" component inside the app, styled with the app
// theme, instead of opening Stripe's hosted page in a browser. The component presents itself
// full-screen. Only rendered when the native SDK is in the binary (see lib/stripe-native.ts);
// callers fall back to the hosted flow otherwise.
import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { SigningAccount } from '@/lib/signed-request';
import { useConnectInstance } from './useConnectInstance';

interface Props {
  visible: boolean;
  accountId: string;
  signer: SigningAccount;
  /** Called when the user leaves the flow (finished or not); re-read the status afterwards. */
  onClose: () => void;
  /** Called with a German message when the session or the component fails to load. */
  onError: (message: string) => void;
}

export default function ConnectOnboardingModal({ visible, accountId, signer, onClose, onError }: Props) {
  const { colors } = useTheme();
  const { stripe, instance } = useConnectInstance({ enabled: visible, accountId, signer, onError });

  if (!visible || !stripe) return null;

  if (!instance) {
    return (
      <Modal transparent animationType="fade" visible onRequestClose={onClose}>
        <View style={[styles.loading, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Modal>
    );
  }

  const { ConnectComponentsProvider, ConnectAccountOnboarding } = stripe;
  return (
    <ConnectComponentsProvider connectInstance={instance}>
      <ConnectAccountOnboarding
        title="Zahlungen einrichten"
        onExit={onClose}
        onLoadError={() => onError('Die Einrichtung konnte nicht geladen werden. Bitte versuche es erneut.')}
        collectionOptions={{ fields: 'eventually_due', futureRequirements: 'include' }}
      />
    </ConnectComponentsProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
