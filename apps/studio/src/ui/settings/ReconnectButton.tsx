// "Ziel neu verbinden": restarts the encoder with the destinations switched on RIGHT NOW,
// so a hung or failed destination can be switched off and dropped without ending the show.

import { useState } from 'react';
import { useShow } from '../../state/store';
import { ConfirmDialog } from '../Dialog';
import { errorText, outputConfig } from '../engine';
import { useStudio } from '../studio';

export function ReconnectButton({ className = 'btn' }: { className?: string }) {
  const { state } = useShow();
  const { onAir } = useStudio();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cfg = outputConfig(state.settings);
  const none = cfg.destinations.length === 0;
  return (
    <>
      <button
        className={className}
        onClick={() => setConfirm(true)}
        disabled={busy || none}
        title={none ? 'Mindestens ein Ziel muss an bleiben – sonst Sendung beenden.' : error ?? undefined}
      >
        {busy ? 'Verbinde neu…' : 'Ziel neu verbinden'}
      </button>
      {confirm && (
        <ConfirmDialog
          title="Ziel neu verbinden?"
          body={
            <p>
              Der Encoder startet neu, mit den Zielen, die jetzt eingeschaltet sind ({cfg.destinations.length}). ALLE Ziele
              sind für einige Sekunden unterbrochen, auch die, die gerade laufen. Die Aufnahme geht in einer neuen Datei
              weiter.
            </p>
          }
          confirmLabel="Neu verbinden"
          onConfirm={() => {
            setConfirm(false);
            setBusy(true);
            setError(null);
            // Re-read at click time: the operator may just have switched a destination off.
            void onAir
              .reconnect({ destinations: outputConfig(state.settings).destinations })
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  );
}
