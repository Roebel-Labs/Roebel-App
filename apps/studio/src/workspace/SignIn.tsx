import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatApiError, pairPoll, pairStart, type PairStart } from './api';
import type { StoredSession } from './session';

const POLL_MS = 2000;

function deviceName(): string {
  const p = (globalThis.navigator?.platform ?? '').toLowerCase();
  return p.startsWith('mac') ? 'Ortis Studio auf dem Mac' : p.startsWith('win') ? 'Ortis Studio unter Windows' : 'Ortis Studio';
}

/** Pairing: QR / code for the Röbel app, or the browser with Ortis ID. Both land on the same poll. */
export function SignIn({ onSignedIn }: { onSignedIn: (s: StoredSession) => void }) {
  const [pair, setPair] = useState<PairStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const start = useCallback(async () => {
    setError(null);
    setPair(null);
    try {
      const p = await pairStart(deviceName());
      if (alive.current) setPair(p);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void start();
    return () => {
      alive.current = false;
    };
  }, [start]);

  useEffect(() => {
    if (!pair) return;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const r = await pairPoll(pair.pollToken);
        if (stopped || r.state !== 'approved') return;
        stopped = true;
        clearInterval(t);
        onSignedIn({ token: r.token, expiresAt: r.expiresAt });
      } catch (e) {
        if (stopped) return;
        if (e instanceof ChatApiError && (e.status === 410 || e.status === 409 || e.status === 404)) {
          stopped = true;
          clearInterval(t);
          void start(); // expired or used: show a fresh code
        }
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [pair, onSignedIn, start]);

  return (
    <div className="ws-signin">
      <div className="ws-signin-card">
        <h1>Willkommen im Arbeitsbereich</h1>
        <p className="w-muted">
          Deine Assistenten für Termine, Mails, Aufgaben und Veranstaltungen. Verbinde Ortis Studio einmal mit deinem
          Röbel- bzw. Ortis-Konto.
        </p>
        {error && (
          <div className="ws-error">
            {error}{' '}
            <button className="w-btn" onClick={() => void start()}>
              Erneut versuchen
            </button>
          </div>
        )}
        {!pair && !error && <div className="w-muted ws-signin-wait">Code wird erzeugt …</div>}
        {pair && (
          <div className="ws-signin-grid">
            <div className="ws-qr">
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(pair.qrSvg)}`} alt="QR-Code zum Verbinden" width={180} height={180} />
            </div>
            <div className="ws-signin-steps">
              <div>
                <strong>Mit dem Handy</strong>
                <p className="w-muted">QR-Code mit der Kamera scannen und in der Röbel App bestätigen.</p>
              </div>
              <div>
                <strong>Im Browser</strong>
                <p className="w-muted">Mit Ortis ID anmelden und bestätigen.</p>
                <button className="w-btn green" onClick={() => void window.studio.shell.openExternal(pair.approveUrl)}>
                  Im Browser verbinden
                </button>
              </div>
              <div className="ws-code">
                <span className="w-muted">Code</span>
                <span className="num">{pair.codeDisplay}</span>
              </div>
            </div>
          </div>
        )}
        <p className="ws-fine">Bestätige nur Codes, die auf deinem eigenen Bildschirm stehen. Der Code gilt 10 Minuten.</p>
      </div>
    </div>
  );
}
