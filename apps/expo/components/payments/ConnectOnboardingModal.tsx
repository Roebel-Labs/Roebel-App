// In-app Stripe onboarding (KYB) for an org's connected account.
//
// Renders Stripe's Connect "account onboarding" component inside the app, styled with the app
// theme, instead of opening Stripe's hosted page in a browser. The component presents itself
// full-screen; this wrapper fetches a short-lived AccountSession from our server, which verifies
// the signer is owner/admin of the org. Only rendered when the native SDK is in the binary
// (see lib/stripe-native.ts); callers fall back to the hosted flow otherwise.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { connectSession } from '@/lib/stripe-connect';
import type { SigningAccount } from '@/lib/signed-request';
import { loadStripeNative } from '@/lib/stripe-native';

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
  const stripe = useMemo(() => loadStripeNative(), []);
  const [instance, setInstance] = useState<unknown>(null);

  // Keep the latest signer/callbacks without re-creating the Stripe instance on every render.
  const signerRef = useRef(signer);
  signerRef.current = signer;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!visible || !stripe) {
      setInstance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const first = await connectSession(signerRef.current, accountId);
      if (cancelled) return;
      if (!first.ok) {
        onErrorRef.current(first.message);
        return;
      }
      // The first secret is used once; Stripe calls fetchClientSecret again when it expires.
      let pending: string | null = first.data.client_secret;
      const created = stripe.loadConnectAndInitialize({
        publishableKey: first.data.publishable_key,
        fetchClientSecret: async () => {
          if (pending) {
            const secret = pending;
            pending = null;
            return secret;
          }
          const next = await connectSession(signerRef.current, accountId);
          if (!next.ok) throw new Error(next.message);
          return next.data.client_secret;
        },
        locale: 'de-DE',
        appearance: {
          variables: {
            colorPrimary: colors.primary,
            colorBackground: colors.background,
            colorText: colors.textPrimary,
            colorSecondaryText: colors.textSecondary,
            colorBorder: colors.border,
            colorDanger: colors.error,
            buttonPrimaryColorBackground: colors.primary,
            buttonPrimaryColorText: colors.onPrimary,
            borderRadius: '12px',
          },
        },
      });
      if (!cancelled) setInstance(created);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, accountId, stripe, colors]);

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
    <ConnectComponentsProvider connectInstance={instance as Parameters<typeof ConnectComponentsProvider>[0]['connectInstance']}>
      <ConnectAccountOnboarding
        title="Zahlungen einrichten"
        onExit={onClose}
        onLoadError={() => onErrorRef.current('Die Einrichtung konnte nicht geladen werden. Bitte versuche es erneut.')}
        collectionOptions={{ fields: 'eventually_due', futureRequirements: 'include' }}
      />
    </ConnectComponentsProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
