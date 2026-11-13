import { useCallback, useEffect, useState } from 'react';
import { ChatApiError, deleteProviderKey, fetchMe, saveProviderKey, type KeyProvider, type Me } from '../../workspace/api';
import { emitCommand, onDesktopCommand } from '../../workspace/desktop';
import { loadSession } from '../../workspace/session';
import { Connections } from './Connections';
import { ACCENT_PRESETS, applyAccent, loadAccent, normalizeAccent, saveAccent } from './accent';
import { IconCheck, IconClose, IconSettings } from './line-icons';
import { currentTheme, onThemeChange, setTheme, THEME_OPTIONS } from './theme';
import { Busy, Skeleton } from '../Skeleton';
import '../tooltip.css';
import { Tip } from '../Tooltip';
import { SHORTCUTS, shortcutHint, shortcutKeys } from './shortcuts';

type Section = 'appearance' | 'shortcuts' | 'connections' | 'keys' | 'account';
const SECTIONS: Array<[Section, string]> = [
  ['appearance', 'Darstellung'],
  ['shortcuts', 'Tastenkürzel'],
  ['connections', 'Verbindungen'],
  ['keys', 'KI-Schlüssel'],
  ['account', 'Konto'],
];
const TIER: Record<string, string> = { free: 'Kostenlos', plus: 'Plus', ultra: 'Ultra' };
const PROVIDERS: Array<{ id: KeyProvider; name: string; hint: string; prefix: string }> = [
  { id: 'anthropic', name: 'Anthropic (Claude)', hint: 'Für alle Assistenten. Mit eigenem Schlüssel zahlst du Anthropic direkt und das Tageskontingent entfällt.', prefix: 'sk-ant-…' },
  { id: 'openai', name: 'OpenAI', hint: 'Für Diktat (Sprache zu Text).', prefix: 'sk-…' },
];

/** Toolbar gear + tray "Einstellungen …": one dialog with four sections. */
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>('appearance');
  const [token, setToken] = useState<string | null>(null);

  useEffect(
    () =>
      onDesktopCommand((c) => {
        if (c.kind !== 'settings') return;
        if (c.section) setSection(c.section);
        setOpen(true);
      }),
    [],
  );
  useEffect(() => {
    if (!open) return;
    void loadSession().then((s) => setToken(s?.token ?? null));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <>
      <Tip label="Einstellungen" keys={shortcutHint('settings')} side="bottom">
        <button className="tb-icon" aria-label="Einstellungen" onClick={() => setOpen(true)}>
          <IconSettings size={16} />
        </button>
      </Tip>
      {open && (
        <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dlg" role="dialog" aria-label="Einstellungen">
            <aside className="dlg-nav">
              <strong>Einstellungen</strong>
              {SECTIONS.map(([id, label]) => (
                <button key={id} className="dlg-nav-item" aria-selected={section === id} onClick={() => setSection(id)}>
                  {label}
                </button>
              ))}
            </aside>
            <section className="dlg-body">
              <button className="w-icon dlg-close" aria-label="Schließen" onClick={() => setOpen(false)}>
                <IconClose size={16} />
              </button>
              {section === 'appearance' && <Appearance />}
              {section === 'shortcuts' && <Shortcuts />}
              {section === 'connections' && (token ? <Connections token={token} /> : <SignedOut />)}
              {section === 'keys' && (token ? <Keys token={token} /> : <SignedOut />)}
              {section === 'account' && (token ? <Account token={token} onSignOut={() => setOpen(false)} /> : <SignedOut />)}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function SignedOut() {
  return <p className="w-muted">Melde dich unter Start mit deinem Konto an, dann erscheinen hier deine Einstellungen.</p>;
}

function Appearance() {
  const [accent, setAccent] = useState(loadAccent);
  const choose = (raw: string) => {
    const v = normalizeAccent(raw);
    if (!v) return;
    setAccent(v);
    applyAccent(v);
    saveAccent(v);
  };
  const [theme, setThemeState] = useState(currentTheme);
  useEffect(() => onThemeChange(setThemeState), []);
  return (
    <>
      <h2>Darstellung</h2>
      <p className="w-muted">„System“ folgt der Einstellung deines Computers. Wird auf diesem Gerät gespeichert.</p>
      <div className="tb-seg" role="radiogroup" aria-label="Darstellung">
        {THEME_OPTIONS.map((o) => (
          <button key={o.id} role="radio" aria-checked={theme === o.id} onClick={() => setTheme(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <h3>Akzentfarbe</h3>
      <p className="w-muted">Gilt für Schaltflächen, Vorschläge und Hervorhebungen im Arbeitsbereich. Wird auf diesem Gerät gespeichert.</p>
      <div className="tb-swatches">
        {ACCENT_PRESETS.map((p) => (
          <button key={p.value} className="tb-swatch" style={{ background: p.value }} title={p.name} aria-label={p.name} aria-pressed={accent === p.value} onClick={() => choose(p.value)}>
            {accent === p.value && <IconCheck size={14} />}
          </button>
        ))}
      </div>
      <label className="tb-custom">
        <span>Eigene Farbe</span>
        <input type="color" value={accent} onChange={(e) => choose(e.target.value)} />
        <code>{accent}</code>
      </label>
    </>
  );
}

function Shortcuts() {
  const groups = ['Allgemein', 'Start', 'Bereiche'] as const;
  return (
    <>
      <h2>Tastenkürzel</h2>
      <p className="w-muted">Die Kürzel stehen auch in den Hinweisen, die beim Überfahren eines Symbols erscheinen.</p>
      {groups.map((g) => (
        <div key={g}>
          <h3>{g}</h3>
          <dl className="keys-list">
            {SHORTCUTS.filter((s) => s.group === g).map((s) => (
              <div key={s.id}>
                <dt>{s.label}</dt>
                <dd>
                  {shortcutKeys(s).map((k) => (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

function Keys({ token }: { token: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<KeyProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetchMe(token).then(setMe).catch((e) => setError((e as Error).message)), [token]);
  useEffect(() => void load(), [load]);

  const save = async (p: KeyProvider) => {
    setBusy(p);
    setError(null);
    try {
      await saveProviderKey(token, p, drafts[p] ?? '');
      setDrafts((d) => ({ ...d, [p]: '' }));
      await load();
    } catch (e) {
      setError(e instanceof ChatApiError ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };
  const remove = async (p: KeyProvider) => {
    setBusy(p);
    try {
      await deleteProviderKey(token, p);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h2>Eigene KI-Schlüssel</h2>
      <p className="w-muted">
        Du kannst deine eigenen API-Schlüssel hinterlegen. Dann laufen die Modellaufrufe über dein Konto beim Anbieter. Die Schlüssel
        werden verschlüsselt gespeichert, geprüft und nie angezeigt.
      </p>
      {error && <div className="ws-error">{error}</div>}
      {!me && !error && (
        <Busy>
          {PROVIDERS.map((p) => (
            <div className="key-row" key={p.id} aria-hidden="true">
              <Skeleton h={14} w={150} />
              <Skeleton h={12} w="80%" />
              <Skeleton h={36} />
            </div>
          ))}
        </Busy>
      )}
      {(me || error) && PROVIDERS.map((p) => {
        const stored = me?.providerKeys.find((k) => k.provider === p.id);
        return (
          <div className="key-row" key={p.id}>
            <div className="key-head">
              <strong>{p.name}</strong>
              {stored && <span className={`w-tag${stored.status === 'active' ? ' ok' : ''}`}>Hinterlegt · …{stored.last4}</span>}
            </div>
            <span className="w-muted">{p.hint}</span>
            {stored ? (
              <button className="w-btn" disabled={busy === p.id} onClick={() => void remove(p.id)}>
                Schlüssel entfernen
              </button>
            ) : (
              <form
                className="conn-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(p.id);
                }}
              >
                <input type="password" placeholder={p.prefix} autoComplete="off" value={drafts[p.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))} />
                <button className="w-btn green" disabled={busy === p.id || !(drafts[p.id] ?? '').trim()}>
                  {busy === p.id ? 'Prüfe …' : 'Speichern'}
                </button>
              </form>
            )}
          </div>
        );
      })}
    </>
  );
}

function Account({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => void fetchMe(token).then(setMe).catch(() => setFailed(true)), [token]);
  const loading = !me && !failed;
  const pct = me ? Math.min(100, Math.round((me.quota.used / Math.max(1, me.quota.limit)) * 100)) : 0;
  return (
    <>
      <h2>Konto</h2>
      {loading ? (
        <Busy className="account-card">
          <Skeleton h={15} w={160} />
          <Skeleton h={12} w={110} />
          <Skeleton h={12} w={210} />
        </Busy>
      ) : (
        <div className="account-card">
          <strong>{me?.displayName || me?.username || 'Angemeldet'}</strong>
          {me?.username && <span className="w-muted">@{me.username}</span>}
          <span className="w-muted">{me?.isCitizen ? 'Verifizierte Bürgerin / verifizierter Bürger' : 'Noch nicht verifiziert'}</span>
        </div>
      )}
      <h3>Plan</h3>
      <div className="account-card">
        {loading ? (
          <Busy className="account-quota-row">
            <Skeleton h={15} w={80} />
            <Skeleton h={12} w={220} />
          </Busy>
        ) : (
          <div className="account-quota-row">
            <strong>{TIER[me?.tier ?? ''] ?? me?.tier ?? 'Unbekannt'}</strong>
            <span className="w-muted">{me?.quota.ownKey ? 'Eigener Schlüssel: unbegrenzt' : `Heute ${pct} % des Tageskontingents genutzt`}</span>
          </div>
        )}
        <div className="account-bar">
          <i style={{ width: `${me?.quota.ownKey ? 100 : 100 - pct}%` }} />
        </div>
        <span className="w-muted">Tarife und Aufladen kommen bald. Bis dahin: eigener Schlüssel unter „KI-Schlüssel“.</span>
      </div>
      <button
        className="w-btn"
        onClick={() => {
          onSignOut();
          emitCommand({ kind: 'signout' });
        }}
      >
        Abmelden
      </button>
    </>
  );
}
