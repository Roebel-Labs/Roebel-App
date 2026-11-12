import { useEffect, useRef, useState } from 'react';
import { emitCommand, onDesktopCommand } from '../../workspace/desktop';
import { fetchMe, type Me } from '../../workspace/api';
import { loadSession } from '../../workspace/session';
import { IconLogout, IconSettings } from './line-icons';

const TIER: Record<string, string> = { free: 'Kostenlos', plus: 'Plus', ultra: 'Ultra' };

function initials(me: Me | null): string {
  const n = (me?.displayName || me?.username || '').trim();
  return n ? n.slice(0, 1).toUpperCase() : '·';
}

/** Rail bottom (Town position): who is signed in, plan and usage, settings, sign out. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const s = await loadSession();
    setSignedIn(!!s);
    if (!s) return setMe(null);
    try {
      setMe(await fetchMe(s.token));
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    void load();
    // Sign-in / sign-out happen elsewhere: refresh on any of those commands.
    return onDesktopCommand((c) => (c.kind === 'signout' || c.kind === 'signedin') && void load());
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const pct = me ? Math.min(100, Math.round((me.quota.used / Math.max(1, me.quota.limit)) * 100)) : 0;
  return (
    <div className="rail-account" ref={ref}>
      <button className="rail-avatar" aria-label="Konto" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {initials(me)}
      </button>
      {open && (
        <div className="account-pop" role="dialog" aria-label="Konto">
          {signedIn ? (
            <>
              <div className="account-head">
                <strong>{me?.displayName || me?.username || 'Angemeldet'}</strong>
                <span className="w-tag">{TIER[me?.tier ?? ''] ?? me?.tier ?? '…'}</span>
              </div>
              {me?.username && <div className="w-muted account-sub">@{me.username}</div>}
              <div className="account-quota">
                <div className="account-quota-row">
                  <span>{me?.quota.ownKey ? 'Eigener Schlüssel' : 'Tageskontingent'}</span>
                  <span className="w-muted">{me?.quota.ownKey ? 'unbegrenzt' : `${100 - pct} % übrig`}</span>
                </div>
                <div className="account-bar">
                  <i style={{ width: `${me?.quota.ownKey ? 100 : 100 - pct}%` }} />
                </div>
              </div>
              <button
                className="account-item"
                onClick={() => {
                  setOpen(false);
                  emitCommand({ kind: 'settings' });
                }}
              >
                <IconSettings size={16} /> Einstellungen
              </button>
              <button
                className="account-item danger"
                onClick={() => {
                  setOpen(false);
                  emitCommand({ kind: 'signout' });
                }}
              >
                <IconLogout size={16} /> Abmelden
              </button>
            </>
          ) : (
            <div className="w-muted account-sub">Nicht angemeldet. Verbinde Ortis Studio unter Start mit deinem Konto.</div>
          )}
        </div>
      )}
    </div>
  );
}
