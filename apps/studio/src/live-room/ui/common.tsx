import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { errorMessage } from '../api';
import { liveRoom, type Snapshot } from '../controller';

export function useLiveRoom(): Snapshot {
  return useSyncExternalStore(liveRoom.subscribe, liveRoom.get);
}

/** Runs an async operator action with a busy flag and a German error line. */
export function useRun(): { run: (f: () => Promise<unknown>) => Promise<boolean>; busy: boolean; error: string | null; clear: () => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, error, clear: () => setError(null) };
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="lr-sec">
      <div className="lr-sec-head">
        <h3>{title}</h3>
        {aside && <div className="lr-sec-aside">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function ErrorLine({ text }: { text: string | null | undefined }) {
  return text ? <div className="lr-error">{text}</div> : null;
}

export function Toggle({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="lr-toggle">
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Read-only credential with a copy button; secrets stay masked on screen. */
export function CopyField({ label, value, secret }: { label: string; value: string | null; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="lr-copy">
      <span className="lr-copy-label">{label}</span>
      <code className="lr-copy-value">{secret ? '•'.repeat(Math.min(24, Math.max(8, value.length))) : value}</code>
      <button className="btn" onClick={copy}>
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  );
}

export function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
