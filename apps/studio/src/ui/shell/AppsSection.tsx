import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { ChatApiError, fetchMyMiniApps, type MyMiniApp } from '../../workspace/api';
import { apiBase, loadSession } from '../../workspace/session';
import { IconPlus } from './line-icons';
import { AppAnalytics } from './AppAnalytics';
import { SkCards } from '../Skeleton';
import { AppBuilder, type BuilderStart } from '../../apps/AppBuilder';
import { TemplateGallery } from '../../apps/TemplateGallery';
import { AppData } from '../../apps/AppData';
import '../../apps/apps.css';

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

/** Mini-Apps: the user's own apps (same list as the web dashboard), templates and the in-Studio builder. */
export function AppsSection() {
  const [apps, setApps] = useState<MyMiniApp[] | null>(null);
  const [state, setState] = useState<'loading' | 'signed-out' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<MyMiniApp | null>(null);
  const [tab, setTab] = useState<'mine' | 'templates'>('mine');
  const [builder, setBuilder] = useState<BuilderStart | null>(null);
  const [dataOf, setDataOf] = useState<MyMiniApp | null>(null);
  const [reload, setReload] = useState(0);

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
  }, [reload]);

  const dashboard = `${apiBase()}/dashboard/mini-apps`;

  if (builder && token) {
    return (
      <div className="section apps">
        <AppBuilder
          token={token}
          start={builder}
          onClose={(changed) => {
            setBuilder(null);
            if (changed) {
              setTab('mine');
              setReload((n) => n + 1);
            }
          }}
        />
      </div>
    );
  }

  if (dataOf && token) {
    return (
      <div className="section apps">
        <AppData token={token} app={dataOf} onBack={() => setDataOf(null)} />
      </div>
    );
  }

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
        <h1>{t('Mini-Apps')}</h1>
        <div className="apps-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
            {t('Meine Apps')}
          </button>
          <button role="tab" aria-selected={tab === 'templates'} className={tab === 'templates' ? 'on' : ''} onClick={() => setTab('templates')}>
            {t('Vorlagen')}
          </button>
        </div>
        <span className="ws-tools-spacer" />
        <button className="w-btn green" disabled={!token} onClick={() => setBuilder({ kind: 'blank' })}>
          <IconPlus size={16} /> {t('Neue Mini-App')}
        </button>
      </header>
      <div className="apps-body">
        {tab === 'templates' && token && <TemplateGallery onPick={(id) => setBuilder({ kind: 'template', id })} />}
        {tab === 'templates' && !token && state !== 'loading' && <div className="w-muted">{t('Melde dich unter Start mit deinem Konto an, dann erscheinen hier deine Mini-Apps.')}</div>}
        {tab === 'mine' && (<>
        {state === 'loading' && <SkCards cards={3} height={168} className="apps-grid" />}
        {state === 'signed-out' && <div className="w-muted">{t('Melde dich unter Start mit deinem Konto an, dann erscheinen hier deine Mini-Apps.')}</div>}
        {state === 'error' && <div className="ws-error">{error}</div>}
        {state === 'ready' && apps && apps.length === 0 && (
          <div className="apps-empty">
            <strong>{t('Noch keine Mini-App')}</strong>
            <span className="w-muted">{t('Bau deine erste Mini-App für Verein oder Betrieb. Sie erscheint nach der Prüfung in der Röbel App.')}</span>
            <div className="app-actions">
              <button className="w-btn green" onClick={() => setBuilder({ kind: 'blank' })}>
                {t('Mini-App erstellen')}
              </button>
              <button className="w-btn" onClick={() => setTab('templates')}>
                {t('Vorlage wählen')}
              </button>
            </div>
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
                      {STATUS[a.status] ? t(STATUS[a.status]) : a.status}
                      {a.pendingUpdate ? ` · ${t('Update in Prüfung')}` : ''}
                    </span>
                  </div>
                </div>
                {a.description && <p className="app-desc">{a.description}</p>}
                <div className="app-actions">
                  <button className="w-btn green" onClick={() => setSelected(a)}>
                    {t('Nutzung')}
                  </button>
                  <button className="w-btn" onClick={() => setDataOf(a)}>
                    {t('Daten')}
                  </button>
                  <button className="w-btn" onClick={() => open(a.homeUrl)}>
                    {t('Öffnen')}
                  </button>
                  <button className="w-btn" onClick={() => setBuilder({ kind: 'app', id: a.id, name: a.name })}>
                    {t('Bearbeiten')}
                  </button>
                  <button className="w-btn" title={t('Inhalte, Bilder und Einstellungen im Web-Dashboard')} onClick={() => open(`${dashboard}/${encodeURIComponent(a.id)}`)}>
                    {t('Dashboard')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}
