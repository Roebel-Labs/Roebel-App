// Shared Stripe Connect instance for the in-app components (onboarding, payments, payouts, banner).
//
// Fetches a short-lived AccountSession from our server (owner/admin only, see
// apps/web/src/app/api/connect/session) and hands Stripe a fetchClientSecret that re-signs a new
// session when the old one expires. Returns null while loading, when disabled, or when the native
// SDK is missing (older binaries); errors are reported once through onError.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { connectSession } from '@/lib/stripe-connect';
import type { SigningAccount } from '@/lib/signed-request';
import { loadStripeNative } from '@/lib/stripe-native';

export type StripeNativeModule = NonNullable<ReturnType<typeof loadStripeNative>>;
export type ConnectInstance = ReturnType<StripeNativeModule['loadConnectAndInitialize']>;

export function useConnectInstance(opts: {
  enabled: boolean;
  accountId: string | null | undefined;
  signer: SigningAccount | null | undefined;
  onError: (message: string) => void;
}): { stripe: StripeNativeModule | null; instance: ConnectInstance | null } {
  const { colors } = useTheme();
  const stripe = useMemo(() => loadStripeNative(), []);
  const [instance, setInstance] = useState<ConnectInstance | null>(null);

  // Latest signer/callback without re-creating the Stripe instance on every render.
  const signerRef = useRef(opts.signer);
  signerRef.current = opts.signer;
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  const { enabled, accountId } = opts;
  const hasSigner = !!opts.signer;

  useEffect(() => {
    if (!enabled || !stripe || !accountId || !hasSigner) {
      setInstance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const signer = signerRef.current;
      if (!signer) return;
      const first = await connectSession(signer, accountId);
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
          const current = signerRef.current;
          if (!current) throw new Error('Nicht angemeldet');
          const next = await connectSession(current, accountId);
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
  }, [enabled, accountId, hasSigner, stripe, colors]);

  return { stripe, instance };
}
