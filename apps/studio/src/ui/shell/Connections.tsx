import { useCallback, useEffect, useState } from 'react';
import { t } from '../../i18n';
import { addMcpConnector, deleteConnector, googleStart, listConnectors, microsoftAdminConsentLink, microsoftStart, type Connector } from '../../workspace/api';
import { onDesktopCommand } from '../../workspace/desktop';
import { Busy, Skeleton } from '../Skeleton';

type Provider = 'google' | 'microsoft';
const LABEL: Record<Provider, string> = { google: 'Google', microsoft: 'Microsoft' };

/** Connectors list (Google, Microsoft 365, MCP servers). Shown in Einstellungen › Verbindungen and Funktionen › Integrationen. */
export function Connections({ token, title = 'Verbindungen' }: { token: string; title?: string }) {
  const [rows, setRows] = useState<Connector[] | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [microsoftAvailable, setMicrosoftAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listConnectors(token);
      setRows(r.connectors);
      setGoogleAvailable(r.googleAvailable);
      setMicrosoftAvailable(Boolean(r.microsoftAvailable));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => void load(), [load]);

  // After "Verbinden" Google runs in the browser. Refresh when Studio regains focus, when the browser hands
  // back via ortis-studio://connected, and every 3 s while waiting (max 5 min).
  const [waiting, setWaiting] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const off = onDesktopCommand((c) => {
      if (c.kind !== 'connected') return;
      // The shell reports only ok/cancelled/error (key "google" for both providers); the list refresh tells which.
      setWaiting(null);
      setNotice(c.result === 'ok' ? t('Verbunden.') : c.result === 'cancelled' ? t('Anmeldung abgebrochen.') : t('Verbindung fehlgeschlagen.'));
      void load();
    });
    return () => {
      window.removeEventListener('focus', onFocus);
      off();
    };
  }, [load]);
  const google = rows?.find((r) => r.kind === 'google');
  const microsoft = rows?.find((r) => r.kind === 'microsoft');
  const waitingDone = waiting === 'google' ? google?.status === 'active' : waiting === 'microsoft' ? microsoft?.status === 'active' : false;
  useEffect(() => {
    if (!waiting) return;
    if (waitingDone) {
      setNotice(t('{provider} ist verbunden.', { provider: LABEL[waiting] }));
      setWaiting(null);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 5 * 60_000) setWaiting(null);
      else void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, waitingDone, load]);

  const openExternal = (url: string) => {
    // Guarded: the browser build and older shells open the page in a new tab.
    if (window.studio?.shell?.openExternal) void window.studio.shell.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  };

  const connect = async (provider: Provider) => {
    setBusy(true);
    setNotice(null);
    try {
      const { url } = provider === 'google' ? await googleStart(token) : await microsoftStart(token);
      openExternal(url);
      setWaiting(provider);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyAdminLink = async () => {
    try {
      await navigator.clipboard.writeText(microsoftAdminConsentLink());
      setNotice(t('Freigabe-Link kopiert. Schick ihn der Person, die euer Microsoft 365 verwaltet.'));
    } catch {
      setNotice(microsoftAdminConsentLink());
    }
  };

  const providerRow = (provider: Provider, row: Connector | undefined, available: boolean, subtitle: string) => (
    <div className="conn-row">
      <div>
        <strong>{provider === 'google' ? 'Google' : 'Microsoft 365'}</strong>
        <span className="w-muted">
          {row ? row.name.replace(/^(Google|Microsoft) \((.*)\)$/, '$2') : subtitle}
          {row && row.status === 'error' ? ` · ${row.lastError ?? t('Verbindung gestört')}` : ''}
        </span>
      </div>
      {rows === null && !error ? (
        <Busy as="span">
          <Skeleton h={32} w={104} style={{ borderRadius: 16 }} />
        </Busy>
      ) : row && row.status === 'active' ? (
        <div className="conn-actions">
          <span className="w-tag ok">{t('Verbunden')}</span>
          <button className="w-btn" disabled={busy} onClick={() => void remove(row.id)}>
            {t('Trennen')}
          </button>
        </div>
      ) : waiting === provider ? (
        <div className="conn-actions">
          <span className="w-muted">{t('Warte auf {provider} im Browser …', { provider: LABEL[provider] })}</span>
          <button className="w-btn" onClick={() => setWaiting(null)}>
            {t('Abbrechen')}
          </button>
        </div>
      ) : available ? (
        <div className="conn-actions">
          {provider === 'microsoft' && (
            <button className="w-btn" onClick={() => void copyAdminLink()} title={t('Für Arbeitskonten, bei denen die IT Apps freigeben muss')}>
              {t('Freigabe-Link')}
            </button>
          )}
          <button className="w-btn green" disabled={busy} onClick={() => void connect(provider)}>
            {row ? t('Neu verbinden') : t('Verbinden')}
          </button>
        </div>
      ) : (
        <span className="w-tag">{t('Noch nicht eingerichtet')}</span>
      )}
    </div>
  );
  const add = async () => {
    setBusy(true);
    try {
      await addMcpConnector(token, name.trim(), url.trim());
      setName('');
      setUrl('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteConnector(token, id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>{t(title)}</h2>
      <p className="w-muted">{t('Was deine Assistenten lesen und nutzen dürfen. Lesen passiert bei Bedarf, nichts wird dauerhaft gespiegelt.')}</p>
      {error && <div className="ws-error">{error}</div>}
      {notice && <div className="conn-notice">{notice}</div>}
      <div className="conn-list">
        {providerRow('google', google, googleAvailable, t('Kalender, Gmail, Drive'))}
        {providerRow('microsoft', microsoft, microsoftAvailable, t('Outlook-Mail und -Kalender'))}
        <div className="conn-row">
          <div>
            <strong>Röbel App</strong>
            <span className="w-muted">{t('Veranstaltungen, Orte, Kontakte, Röbel Münzen')}</span>
          </div>
          <span className="w-tag ok">{t('Immer verbunden')}</span>
        </div>
        {rows?.filter((r) => r.kind === 'mcp').map((r) => (
          <div className="conn-row" key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <span className="w-muted">
                {r.url} · {r.toolCount === 1 ? t('1 Werkzeug') : t('{n} Werkzeuge', { n: r.toolCount })}
                {r.status === 'error' ? ` · ${t('Fehler: {message}', { message: r.lastError ?? '' })}` : ''}
              </span>
            </div>
            <button className="w-btn" disabled={busy} onClick={() => void remove(r.id)}>
              {t('Entfernen')}
            </button>
          </div>
        ))}
      </div>
      <h3>{t('MCP-Server hinzufügen')}</h3>
      <p className="w-muted">{t('Eigene Werkzeuge über das Model Context Protocol (https-Adresse).')}</p>
      <form
        className="conn-form"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input placeholder={t('Name')} value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="https://…/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="w-btn" disabled={busy || !name.trim() || !/^https:\/\//.test(url.trim())}>
          {t('Hinzufügen')}
        </button>
      </form>
    </>
  );
}
