/**
 * An Ausweis invite link (https://www.roebel.app/invite/ausweis/<token>, roebel://invite/ausweis/<token>).
 * Signed out → the login drawer; signed in → `redeem` binds the link to this account, then the
 * accept screen opens. The token is one-time and secret: it never goes to a log, analytics or
 * another route.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import LoginDrawer from '@/components/LoginDrawer';
import { CredentialScreenFrame, CredentialStatus } from '@/components/credentials/CredentialScreenFrame';
import { rememberInvitation } from '@/lib/credreg/accept';
import { redeemInvitation } from '@/lib/credreg/api';
import { useCredentialsGate } from '@/lib/credreg/gate';

type Failure = { title: string; message: string; retry: boolean };

function failureFor(code: string, message: string): Failure {
  switch (code) {
    case 'ALREADY_REDEEMED':
      return { title: 'Schon abgeholt', message: 'Dieser Ausweis wurde bereits abgeholt.', retry: false };
    case 'REVOKED':
      return { title: 'Zurückgezogen', message: 'Dieser Ausweis wurde zurückgezogen.', retry: false };
    case 'RATE_LIMITED':
      return { title: 'Einen Moment', message: 'Zu viele Versuche. Bitte warte eine Minute.', retry: true };
    case 'NETWORK_ERROR':
      return { title: 'Keine Verbindung', message: 'Bitte prüfe deine Verbindung und versuche es noch einmal.', retry: true };
    default:
      // NOT_FOUND, BAD_REQUEST and anything unknown. `message` is ignored on purpose.
      void message;
      return { title: 'Link ungültig', message: 'Dieser Link ist nicht gültig.', retry: false };
  }
}

export default function AusweisInviteScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = typeof tokenParam === 'string' ? tokenParam : '';
  const router = useRouter();
  const account = useActiveAccount();
  const gate = useCredentialsGate();
  const [showLogin, setShowLogin] = useState(false);
  const [failure, setFailure] = useState<{ key: string; f: Failure } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null);

  const address = account?.address?.toLowerCase();
  const key = `${address ?? ''}:${attempt}`;

  useEffect(() => {
    if (gate !== true || !account || !token) return;
    // One redeem per account and attempt (effects can run twice).
    if (started.current === key) return;
    started.current = key;
    let cancelled = false;
    redeemInvitation(account, token)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          rememberInvitation(res.data);
          router.replace(`/credentials/accept/${res.data.id}` as any);
          return;
        }
        setFailure({ key, f: failureFor(res.code, res.message) });
      })
      .catch(() => {
        if (!cancelled) setFailure({ key, f: failureFor('NETWORK_ERROR', '') });
      });
    return () => {
      cancelled = true;
      // A cancelled run may start again (StrictMode remount).
      if (started.current === key) started.current = null;
    };
    // account identity changes on re-render; the address is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, address, token, key]);

  if (!token) {
    return (
      <CredentialScreenFrame title="Ausweis abholen">
        <CredentialStatus title="Link ungültig" message="Dieser Link ist nicht gültig." />
      </CredentialScreenFrame>
    );
  }
  if (gate === false) {
    return (
      <CredentialScreenFrame title="Ausweis abholen">
        <CredentialStatus title="Noch nicht verfügbar" message="Ausweise gibt es in deiner App bald. Bewahre den Link auf." />
      </CredentialScreenFrame>
    );
  }
  if (!account) {
    return (
      <CredentialScreenFrame title="Ausweis abholen">
        <CredentialStatus
          title="Bitte melde dich an"
          message="Melde dich an, um deinen Ausweis abzuholen."
          actionLabel="Anmelden"
          onAction={() => setShowLogin(true)}
        />
        {/* Closes itself once the login lands; the redeem then starts. */}
        <LoginDrawer visible={showLogin && !account} onClose={() => setShowLogin(false)} />
      </CredentialScreenFrame>
    );
  }
  const shown = failure && failure.key === key ? failure.f : null;
  if (shown) {
    return (
      <CredentialScreenFrame title="Ausweis abholen">
        <CredentialStatus
          title={shown.title}
          message={shown.message}
          actionLabel={shown.retry ? 'Erneut versuchen' : 'Zum Profil'}
          onAction={shown.retry ? () => setAttempt((n) => n + 1) : () => router.replace('/profile' as any)}
        />
      </CredentialScreenFrame>
    );
  }
  return (
    <CredentialScreenFrame title="Ausweis abholen">
      <CredentialStatus loading message="Dein Ausweis wird abgeholt …" />
    </CredentialScreenFrame>
  );
}
