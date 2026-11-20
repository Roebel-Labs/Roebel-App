/**
 * Route wrapper for the designer screens: they draw with Skia, so the screen module is required
 * only when this binary has Skia. An older binary (OTA onto a 3.10.0 build without Skia) shows a
 * short notice instead of crashing; expo-router may evaluate every route module at start-up.
 */
import React from 'react';
import { CredentialScreenFrame, CredentialStatus } from '@/components/credentials/CredentialScreenFrame';
import { skiaAvailable } from '@/lib/card-design/skia-available';

export const UPDATE_NEEDED = 'Für den Ausweis-Designer brauchst du die neueste Version der Röbel App aus dem App Store bzw. Play Store.';

export function SkiaScreenGate({ title, load }: { title: string; load: () => React.ComponentType }) {
  let Screen: React.ComponentType | null = null;
  if (skiaAvailable()) {
    try {
      Screen = load();
    } catch (err) {
      console.warn('[designer] screen could not be loaded:', err instanceof Error ? err.message : err);
    }
  }
  if (!Screen) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="App aktualisieren" message={UPDATE_NEEDED} />
      </CredentialScreenFrame>
    );
  }
  return <Screen />;
}
