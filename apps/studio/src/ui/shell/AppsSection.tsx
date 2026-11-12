import { useEffect, useState } from 'react';
import { ChatApiError, fetchMyMiniApps, type MyMiniApp } from '../../workspace/api';
import { apiBase, loadSession } from '../../workspace/session';
import { IconPlus } from './line-icons';
import { AppAnalytics } from './AppAnalytics';

const STATUS: Record<MyMiniApp['status'], string> = {
  draft: 'Entwurf',
  pending: 'In Prüfung',
  approved: 'Freigegeben',
  live: 'Live',
  rejected: 'Abgelehnt',
  suspended: 'Gesperrt',
};

const open = (url: string) => {
  if (/^https:\/\//.test(url)) void window.studio.shell.openExternal(url);
};

/** Mini-Apps: the signed-in user's own apps (same list as the web dashboard), with open/edit/new. */
export function AppsSection() {
  const [apps, setApps] = useState<MyMiniApp[] | null>(null);
  const [state, setState] = useState<'loading' | 'signed-out' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<MyMiniApp | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await loadSession();
      if (!session) return alive && setState('signed-out');
      setToken(session.token);
      try {
        const r = await fetchMyMiniApps(session.token);
        if (!alive) return;
        setApps(r.apps);
        setState('ready');
      } catch (e) {
        if (!alive) return;
        setState(e instanceof ChatApiError && e.status === 401 ? 'signed-out' : 'error');
        setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dashboard = `${apiBase()}/dashboard/mini-apps`;

  if (selected && token) {
    return (
      <div className="section apps">
        <AppAnalytics token={token} app={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="section apps">
      <header className="section-head">
        <h1>Mini-Apps</h1>
        <span className="ws-tools-spacer" />
        <button className="w-btn green" onClick={() => open(`${dashboard}/new`)}>
          <IconPlus size={16} /> Neue Mini-App
        </button>
      </header>
      <div className="apps-body">
        {state === 'loading' && <div className="w-muted">Lade …</div>}
        {state === 'signed-out' && <div className="w-muted">Melde dich unter Start mit deinem Konto an, dann erscheinen hier deine Mini-Apps.</div>}
        {state === 'error' && <div className="ws-error">{error}</div>}
        {state === 'ready' && apps && apps.length === 0 && (
          <div className="apps-empty">
            <strong>Noch keine Mini-App</strong>
            <span className="w-muted">Bau deine erste Mini-App für Verein oder Betrieb. Sie erscheint nach der Prüfung in der Röbel App.</span>
            <button className="w-btn green" onClick={() => open(`${dashboard}/new`)}>
              Mini-App erstellen
            </button>
          </div>
        )}
        {state === 'ready' && apps && apps.length > 0 && (
          <div className="apps-grid">
            {apps.map((a) => (
              <article key={a.id} className="app-card">
                <div className="app-card-top">
                  {a.iconUrl ? (
                    <img className="app-icon" src={a.iconUrl} alt="" />
                  ) : (
                    <span className="app-icon placeholder" style={{ background: a.primaryColor ?? undefined }}>
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="app-card-title">
                    <strong className="w-ellipsis">{a.name}</strong>
                    <span className={`app-status ${a.status}`}>
                      {STATUS[a.status] ?? a.status}
                      {a.pendingUpdate ? ' · Update in Prüfung' : ''}
                    </span>
                  </div>
                </div>
                {a.description && <p className="app-desc">{a.description}</p>}
                <div className="app-actions">
                  <button className="w-btn green" onClick={() => setSelected(a)}>
                    Nutzung
                  </button>
                  <button className="w-btn" onClick={() => open(a.homeUrl)}>
                    Öffnen
                  </button>
                  <button className="w-btn" onClick={() => open(`${dashboard}/${encodeURIComponent(a.id)}`)}>
                    Bearbeiten
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
