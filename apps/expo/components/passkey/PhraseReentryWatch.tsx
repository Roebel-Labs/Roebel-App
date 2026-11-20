/**
 * Root-layout watcher for words (expert-path) sessions: when a signature finds the protected
 * 12 words gone (fingerprints / Face ID changed and the system invalidated them), the session
 * signer announces it (lib/passkey/phrase-events.ts) and this opens "enter your 12 words again"
 * once. The person stays signed in; nothing is cleared.
 *
 * Production safety: imports only the import-free event module and the router; renders nothing.
 */
import { useEffect } from 'react';
import { useRouter, type Href } from 'expo-router';
import { routeOnPhraseUnavailable } from '@/lib/passkey/phrase-events';

export default function PhraseReentryWatch() {
  const router = useRouter();
  useEffect(() => routeOnPhraseUnavailable((route) => router.push(route as Href)), [router]);
  return null;
}
