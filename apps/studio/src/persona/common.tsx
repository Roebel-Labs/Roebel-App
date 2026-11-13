// Shared building blocks of the personal-context sections: session, layout frame, dialogs, small controls.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChatApiError, buildPersona, googleStart, type PersonaStatus } from '../workspace/api';
import { onDesktopCommand } from '../workspace/desktop';
import { loadSession } from '../workspace/session';
import { IconClose, IconMore } from '../ui/shell/line-icons';
import { friendlyError, hueIndex, initials } from './format';

/** Opens a link outside the app; works in Electron and in the browser build. */
export function openExternal(url: string): void {
  if (!/^https?:\/\//.test(url)) return;
  const shell = (window as { studio?: { shell?: { openExternal?: (u: string) => unknown } } }).studio?.shell;
  if (shell?.openExternal) void shell.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

export type TokenState = { state: 'loading' | 'signed-out'; token: null } | { state: 'ready'; token: string };

/** The chat session token; follows sign-in and sign-out that happen in the Start section. */
export function useSessionToken(): TokenState & { signedOut: () => void } {
  const [s, setS] = useState<TokenState>({ state: 'loading', token: null });
  const load = useCallback(() => {
    void loadSession().then((session) => setS(session ? { state: 'ready', token: session.token } : { state: 'signed-out', token: null }));
  }, []);
  useEffect(() => {
    load();
    return onDesktopCommand((c) => {
      if (c.kind === 'signedin') load();
      else if (c.kind === 'signout') setS({ state: 'signed-out', token: null });
    });
  }, [load]);
  const signedOut = useCallback(() => setS({ state: 'signed-out', token: null }), []);
  return { ...s, signedOut };
}

export const isUnauthorized = (e: unknown) => e instanceof ChatApiError && e.status === 401;

/** Loads data with loading / error / retry; a 401 reports the session as gone. */
export function useLoad<T>(fn: (() => Promise<T>) | null, onUnauthorized?: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!fn);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  const seq = useRef(0);
  const reload = useCallback(async (quiet = false) => {
    const f = fnRef.current;
    if (!f) return;
    const mine = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const r = await f();
      if (mine !== seq.current) return;
      setData(r);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      if (isUnauthorized(e)) unauthorized.current?.();
      // A background refresh never replaces content that is already on screen with an error.
      if (!quiet) setError(friendlyError(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);
  const enabled = !!fn;
  useEffect(() => {
    if (enabled) void reload();
    return () => {
      seq.current++;
    };
  }, [enabled, reload]);
  return { data, setData, error, loading, reload };
}

/** Calls `fn` every `ms` while `active`. */
export function usePoll(active: boolean, fn: () => void, ms = 3000): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

export function SignedOutHint({ what }: { what: string }) {
  return <div className="pz-state w-muted">Melde dich unter Start mit deinem Konto an, dann erscheinen hier {what}.</div>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="pz-state">
      <div className="ws-error">{message}</div>
      {onRetry && (
        <button className="w-btn" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

export interface NavEntry {
  id: string;
  label: string;
  icon?: ReactNode;
  indent?: boolean;
  badge?: string;
  dividerBefore?: boolean;
}

/** Section layout: title + sub-navigation on the left, scrolling content on the right. */
export function Frame({
  title, nav, active, onSelect, actions, children, wide, narrow,
}: {
  title: string;
  nav: NavEntry[];
  active: string;
  onSelect: (id: string) => void;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /** Reading column for lists (Für dich). */
  narrow?: boolean;
}) {
  return (
    <div className="section pz">
      <aside className="pz-nav">
        <h1 className="pz-nav-title">{title}</h1>
        <nav className="pz-nav-items">
          {nav.map((n) => (
            <div key={n.id} className="pz-nav-wrap">
              {n.dividerBefore && <hr className="pz-nav-divider" />}
              <button className={`pz-nav-item${n.indent ? ' indent' : ''}`} aria-current={active === n.id ? 'page' : undefined} onClick={() => onSelect(n.id)}>
                {n.badge !== undefined ? <Initial name={n.badge} size={18} /> : n.icon}
                <span className="w-ellipsis">{n.label}</span>
              </button>
            </div>
          ))}
        </nav>
      </aside>
      <div className="pz-main">
        {actions && <div className="pz-actions">{actions}</div>}
        <div className="pz-scroll">
          <div className={`pz-content${wide ? ' wide' : narrow ? ' narrow' : ''}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const BADGE_HUES = ['#4f7fe0', '#3e9e6d', '#e08a3c', '#c95a8c', '#8a63d2', '#2f9aa8'];

/** Square initial badge (people, avatar tiles); the colour is stable per name. */
export function Initial({ name, size = 22 }: { name: string; size?: number }) {
  const hue = BADGE_HUES[hueIndex(name, BADGE_HUES.length)];
  return (
    <span className="pz-initial" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.48)), ['--hue' as string]: hue }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" className="pz-toggle" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled} onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}

export function Modal({ title, onClose, children, footer, size = 'md' }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`pz-modal ${size}`} role="dialog" aria-label={title}>
        <header className="pz-modal-head">
          <strong className="w-ellipsis">{title}</strong>
          <button className="w-icon" aria-label="Schließen" onClick={onClose}>
            <IconClose size={16} />
          </button>
        </header>
        <div className="pz-modal-body">{children}</div>
        {footer && <footer className="pz-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Confirm({ title, body, confirmLabel, busy, onConfirm, onCancel }: { title: string; body: ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button className="w-btn" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button className="w-btn danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="pz-confirm-text">{body}</div>
    </Modal>
  );
}

/** "⋯" button with a small menu; closes on outside click and Escape. */
export function MoreMenu({ items, label = 'Mehr' }: { items: Array<{ label: string; danger?: boolean; onSelect: () => void }>; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="pz-more" ref={ref}>
      <button className={`w-icon${open ? ' on' : ''}`} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconMore size={18} />
      </button>
      {open && (
        <div className="pz-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={`pz-menu-item${it.danger ? ' danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input className="ws-search pz-search" type="search" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Google consent in the browser, then wait for the hand-back (deep link, window focus or polling). */
export function useGoogleConnect(token: string | null, onChange: () => void) {
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const onFocus = () => changed.current();
    window.addEventListener('focus', onFocus);
    const off = onDesktopCommand((c) => {
      if (c.kind !== 'connected') return;
      setWaiting(false);
      if (c.result === 'error') setError('Google-Verbindung fehlgeschlagen.');
      changed.current();
    });
    const t = setInterval(() => {
      if (Date.now() - started > 5 * 60_000) setWaiting(false);
      else changed.current();
    }, 3000);
    return () => {
      window.removeEventListener('focus', onFocus);
      off();
      clearInterval(t);
    };
  }, [waiting]);

  const start = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await googleStart(token);
      openExternal(url);
      setWaiting(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, [token]);

  return { start, waiting, busy, error, stop: () => setWaiting(false) };
}

/**
 * First-run and build states shared by Für dich and Wiki: the "Lern mich kennen" card while the wiki is
 * empty, the progress bar while it is being built, and the retry card after a failed build.
 */
export function PersonaOnboarding({ token, status, onChanged, onImport }: { token: string; status: PersonaStatus; onChanged: () => void; onImport: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const google = useGoogleConnect(token, onChanged);
  const connected = status.sources.google;
  useEffect(() => {
    if (connected && google.waiting) google.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, google.waiting]);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      await buildPersona(token, 'full');
      onChanged();
    } catch (e) {
      // 409 = a build is already running: just show its progress.
      if (e instanceof ChatApiError && e.status === 409) onChanged();
      else setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (status.state === 'building') return <BuildProgress status={status} />;

  const failed = status.state === 'error';
  return (
    <div className="pz-onboard">
      <h2>{failed ? 'Das Wiki konnte nicht aufgebaut werden' : 'Lern mich kennen'}</h2>
      {failed ? (
        <p>{status.error || 'Beim Aufbau ist etwas schiefgegangen.'} Du kannst es einfach noch einmal versuchen.</p>
      ) : (
        <p>
          Ortis baut aus deinen verbundenen Quellen ein persönliches Wiki: wer du bist, woran du arbeitest und mit wem. Daraus entstehen
          Vorschläge für Aufgaben und Routinen. Du kannst jede Seite lesen, korrigieren und jederzeit alles löschen.
        </p>
      )}
      <ul className="pz-onboard-sources">
        <li>
          <span>Google (Kalender, Gmail)</span>
          {connected ? <span className="w-tag ok">Verbunden</span> : google.waiting ? <span className="w-muted">Warte auf Google im Browser …</span> : <span className="w-tag">Nicht verbunden</span>}
        </li>
        <li>
          <span>Röbel App</span>
          <span className="w-tag ok">Immer verbunden</span>
        </li>
        <li>
          <span>Importe aus Claude oder ChatGPT</span>
          <span className="w-tag">{status.sources.imports}</span>
        </li>
      </ul>
      {(error || google.error) && <div className="ws-error">{error || google.error}</div>}
      <div className="pz-onboard-actions">
        <button className="w-btn green" disabled={busy} onClick={() => void build()}>
          {busy ? 'Starte …' : failed ? 'Erneut aufbauen' : 'Wiki jetzt aufbauen'}
        </button>
        {!connected && (
          <button className="w-btn" disabled={google.busy || google.waiting} onClick={() => void google.start()}>
            Google verbinden
          </button>
        )}
        <button className="w-btn" onClick={onImport}>
          Aus Claude oder ChatGPT importieren
        </button>
      </div>
    </div>
  );
}

export function BuildProgress({ status, compact }: { status: PersonaStatus; compact?: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, status.progress || 0)) * 100);
  return (
    <div className={`pz-build${compact ? ' compact' : ''}`} role="status">
      <div className="pz-build-row">
        <span className="ws-spinner" aria-hidden="true" />
        <strong>{status.stageLabel || 'Ortis baut dein Wiki auf …'}</strong>
        <span className="w-muted">{pct} %</span>
      </div>
      <div className="account-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      {!compact && <span className="w-muted">Das dauert ein paar Minuten. Du kannst in der Zwischenzeit weiterarbeiten.</span>}
    </div>
  );
}
