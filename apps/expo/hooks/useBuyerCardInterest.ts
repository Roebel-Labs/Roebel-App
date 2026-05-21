import { useCallback, useEffect, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';

import {
  checkBuyerCardInterest,
  submitBuyerCardInterest,
  type BuyerInterestErrorCode,
} from '@/lib/supabase-buyer-card-interest';

export type BuyerInterestStatus = 'idle' | 'loading' | 'submitting' | 'submitted' | 'error';

interface UseBuyerCardInterest {
  status: BuyerInterestStatus;
  isSubmitted: boolean;
  errorMessage: string | null;
  submit: () => Promise<void>;
}

function germanError(code: BuyerInterestErrorCode | undefined): string {
  switch (code) {
    case 'NO_EMAIL_ON_USER':
      return 'Bitte ergänze deine E-Mail-Adresse im Profil.';
    case 'USER_NOT_FOUND':
      return 'Bitte melde dich erneut an.';
    case 'NO_WALLET':
      return 'Bitte verbinde zuerst dein Wallet.';
    default:
      return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
  }
}

export function useBuyerCardInterest(): UseBuyerCardInterest {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;

  const [status, setStatus] = useState<BuyerInterestStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refresh submission state whenever the active wallet changes.
  useEffect(() => {
    if (!wallet) {
      setStatus('idle');
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);

    void checkBuyerCardInterest(wallet).then((result) => {
      if (cancelled) return;
      if (result.ok && result.alreadyRegistered) {
        setStatus('submitted');
      } else {
        // Treat lookup errors as a soft fallback to 'idle' — the user can still
        // attempt to submit and we'll surface the error then.
        setStatus('idle');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const submit = useCallback(async () => {
    if (!wallet) {
      setStatus('error');
      setErrorMessage(germanError('NO_WALLET'));
      return;
    }
    if (status === 'submitting' || status === 'submitted') return;

    setStatus('submitting');
    setErrorMessage(null);

    const result = await submitBuyerCardInterest(wallet);
    if (result.ok) {
      setStatus('submitted');
      return;
    }

    setStatus('error');
    setErrorMessage(germanError(result.code));
  }, [wallet, status]);

  return {
    status,
    isSubmitted: status === 'submitted',
    errorMessage,
    submit,
  };
}
