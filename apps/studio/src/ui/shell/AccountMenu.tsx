import { useEffect, useRef, useState } from 'react';
import { emitCommand, onDesktopCommand } from '../../workspace/desktop';
import { fetchMe, type Me } from '../../workspace/api';
import { loadSession } from '../../workspace/session';
import { IconAgent, IconLogout, IconMoon, IconSettings, IconSun } from './line-icons';
import { useAgent } from '../../agent/agent-store';
import { useAgentAppIcon } from '../../agent/app-icon';
import { currentTheme, isSystemDark, onThemeChange, resolveTheme, setTheme, toggledTheme } from './theme';
import { Busy, Skeleton } from '../Skeleton';
import { Tip } from '../Tooltip';

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
  const [meFailed, setMeFailed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const agent = useAgent(token);
  // Signed out: back to the Ortis icon.
  useAgentAppIcon(agent.status === 'ready' ? agent.data.agent.characterId : null, agent.status === 'ready' || agent.status === 'unavailable' || !signedIn);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const s = await loadSession();
    setSignedIn(!!s);
    setToken(s?.token ?? null);
    if (!s) return setMe(null);
    try {
      setMe(await fetchMe(s.token));
      setMeFailed(false);
    } catch {
      setMe(null);
      setMeFailed(true);
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

  // Quick appearance toggle (the full System / Hell / Dunkel choice is in Einstellungen → Darstellung).
  const [theme, setThemeState] = useState(currentTheme);
  useEffect(() => onThemeChange(setThemeState), []);
  const dark = resolveTheme(theme, isSystemDark()) === 'dark';
  const themeItem = (
    <button className="account-item" onClick={() => setTheme(toggledTheme(theme, isSystemDark()))}>
      {dark ? <IconSun size={16} /> : <IconMoon size={16} />} {dark ? 'Helle Darstellung' : 'Dunkle Darstellung'}
    </button>
  );

  const pct = me ? Math.min(100, Math.round((me.quota.used / Math.max(1, me.quota.limit)) * 100)) : 0;
  return (
    <div className="rail-account" ref={ref}>
      <Tip label="Konto" side="right" disabled={open}>
        <button className="rail-avatar" aria-label="Konto" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {initials(me)}
        </button>
      </Tip>
      {open && (
        <div className="account-pop" role="dialog" aria-label="Konto">
          {signedIn ? (
            <>
              {me || meFailed ? (
                <div className="account-head">
                  <strong>{me?.displayName || me?.username || 'Angemeldet'}</strong>
                  {me && <span className="w-tag">{TIER[me.tier ?? ''] ?? me.tier}</span>}
                </div>
              ) : (
                <Busy className="account-head">
                  <Skeleton h={15} w={130} />
                  <Skeleton h={20} w={64} />
                </Busy>
              )}
              {me?.username && <div className="w-muted account-sub">@{me.username}</div>}
              <div className="account-quota">
                {me || meFailed ? (
                  <div className="account-quota-row">
                    <span>{me?.quota.ownKey ? 'Eigener Schlüssel' : 'Tageskontingent'}</span>
                    <span className="w-muted">{me?.quota.ownKey ? 'unbegrenzt' : me ? `${100 - pct} % übrig` : 'nicht abrufbar'}</span>
                  </div>
                ) : (
                  <Busy className="account-quota-row">
                    <Skeleton h={13} w={110} />
                    <Skeleton h={13} w={70} />
                  </Busy>
                )}
                <div className="account-bar">
                  <i style={{ width: `${me?.quota.ownKey ? 100 : 100 - pct}%` }} />
                </div>
              </div>
              {agent.status === 'ready' && (
                <button
                  className="account-item"
                  onClick={() => {
                    setOpen(false);
                    emitCommand({ kind: 'navigate', section: 'agent' });
                  }}
                >
                  <IconAgent size={16} /> Mein Assistent
                </button>
              )}
              <button
                className="account-item"
                onClick={() => {
                  setOpen(false);
                  emitCommand({ kind: 'settings' });
                }}
              >
                <IconSettings size={16} /> Einstellungen
              </button>
              {themeItem}
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
            <>
              <div className="w-muted account-sub">Nicht angemeldet. Verbinde Ortis Studio unter Start mit deinem Konto.</div>
              {themeItem}
            </>
          )}
        </div>
      )}
    </div>
  );
}
