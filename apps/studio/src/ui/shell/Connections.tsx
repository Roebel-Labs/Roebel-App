import { useCallback, useEffect, useState } from 'react';
import { t } from '../../i18n';
import { addMcpConnector, deleteConnector, googleStart, listConnectors, type Connector } from '../../workspace/api';
import { onDesktopCommand } from '../../workspace/desktop';
import { Busy, Skeleton } from '../Skeleton';

/** Connectors list (Google, MCP servers). Shown in Einstellungen › Verbindungen and Funktionen › Integrationen. */
export function Connections({ token, title = 'Verbindungen' }: { token: string; title?: string }) {
  const [rows, setRows] = useState<Connector[] | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listConnectors(token);
      setRows(r.connectors);
      setGoogleAvailable(r.googleAvailable);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => void load(), [load]);

  // After "Verbinden" Google runs in the browser. Refresh when Studio regains focus, when the browser hands
  // back via ortis-studio://connected, and every 3 s while waiting (max 5 min).
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const off = onDesktopCommand((c) => {
      if (c.kind !== 'connected') return;
      setWaiting(false);
      setNotice(c.result === 'ok' ? t('Google ist verbunden.') : c.result === 'cancelled' ? t('Google-Anmeldung abgebrochen.') : t('Google-Verbindung fehlgeschlagen.'));
      void load();
    });
    return () => {
      window.removeEventListener('focus', onFocus);
      off();
    };
  }, [load]);
  const google = rows?.find((r) => r.kind === 'google');
  useEffect(() => {
    if (!waiting) return;
    if (google) {
      setWaiting(false);
      setNotice(t('Google ist verbunden.'));
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 5 * 60_000) setWaiting(false);
      else void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, google, load]);

  const connectGoogle = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { url } = await googleStart(token);
      // Guarded: the browser build and older shells open the consent page in a new tab.
      if (window.studio?.shell?.openExternal) void window.studio.shell.openExternal(url);
      else window.open(url, '_blank', 'noopener');
      setWaiting(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
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
        <div className="conn-row">
          <div>
            <strong>Google</strong>
            <span className="w-muted">{google ? google.name.replace(/^Google \((.*)\)$/, '$1') : t('Kalender, Gmail, Drive')}</span>
          </div>
          {rows === null && !error ? (
            <Busy as="span">
              <Skeleton h={32} w={104} style={{ borderRadius: 16 }} />
            </Busy>
          ) : google ? (
            <div className="conn-actions">
              <span className="w-tag ok">{t('Verbunden')}</span>
              <button className="w-btn" disabled={busy} onClick={() => void remove(google.id)}>
                {t('Trennen')}
              </button>
            </div>
          ) : googleAvailable ? (
            waiting ? (
              <div className="conn-actions">
                <span className="w-muted">{t('Warte auf Google im Browser …')}</span>
                <button className="w-btn" onClick={() => setWaiting(false)}>
                  {t('Abbrechen')}
                </button>
              </div>
            ) : (
              <button className="w-btn green" disabled={busy} onClick={() => void connectGoogle()}>
                {t('Verbinden')}
              </button>
            )
          ) : (
            <span className="w-tag">{t('Noch nicht eingerichtet')}</span>
          )}
        </div>
        <div className="conn-row">
          <div>
            <strong>Microsoft 365</strong>
            <span className="w-muted">{t('Outlook, Kalender, OneDrive')}</span>
          </div>
          <span className="w-tag">{t('Geplant')}</span>
        </div>
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
