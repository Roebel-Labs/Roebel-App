// "Ausweise": an org admin manages credential types, people, batches, event badges and delegates.
// Studio cannot sign: every change is prepared here and confirmed in the Röbel App on the phone.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { Frame, LoadError, SignedOutHint, useSessionToken } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { fetchOrgs, fetchStatus, isSessionError } from './api';
import type { CredentialsStatus, OrgListItem } from './types';
import { CredTab, type TabContext } from './tabs';
import '../persona/persona.css';
import './credentials.css';

type Tab = 'types' | 'people' | 'batches' | 'events' | 'settings';
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'types', label: 'Typen' },
  { id: 'people', label: 'Personen' },
  { id: 'batches', label: 'Ausstellungen' },
  { id: 'events', label: 'Veranstaltungen' },
  { id: 'settings', label: 'Einstellungen' },
];

/** The two explanation texts of plan 2 Task 4 for an org that cannot prepare anything yet. */
function NotReady({ org }: { org: OrgListItem }) {
  return (
    <div className="pz-state cr-gate">
      <strong>{org.name}</strong>
      <p className="pz-lead">
        {org.onChain === 'org_not_registered'
          ? t('Diese Organisation ist noch nicht im öffentlichen Register eingetragen.')
          : t('Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Öffne in der Röbel App die Einstellungen der Organisation und gleiche dort die Rollen mit dem Register ab.')}
      </p>
    </div>
  );
}

export function CredentialsSection() {
  const session = useSessionToken();
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [orgs, setOrgs] = useState<OrgListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('types');
  /** An error of a tab action: shown above the tab, which keeps its input. */
  const [notice, setNotice] = useState<string | null>(null);
  const { signedOut, token } = session;

  // A lost session (401) shows the sign-in hint; the pending actions stay on the server.
  const onError = useCallback(
    (e: unknown) => {
      if (isSessionError(e)) signedOut();
      else setNotice((e as Error).message);
    },
    [signedOut],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [s, o] = await Promise.all([fetchStatus(), fetchOrgs(token)]);
      setStatus(s);
      setOrgs(o);
      setOrgId((cur) => (cur && o.some((x) => x.accountId === cur) ? cur : (o[0]?.accountId ?? null)));
    } catch (e) {
      if (isSessionError(e)) signedOut();
      else setError((e as Error).message);
    }
  }, [token, signedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const org = orgs?.find((o) => o.accountId === orgId) ?? null;
  const picker =
    orgs && orgs.length > 1 ? (
      <select className="pz-select" aria-label={t('Organisation')} value={orgId ?? ''} onChange={(e) => (setOrgId(e.target.value), setNotice(null))}>
        {orgs.map((o) => (
          <option key={o.accountId} value={o.accountId}>
            {o.name}
          </option>
        ))}
      </select>
    ) : undefined;

  let body: ReactNode;
  if (session.state === 'loading' || (token && !orgs && !error)) body = <SkCards cards={3} height={120} />;
  else if (session.state === 'signed-out') body = <SignedOutHint what={t('die Ausweise deiner Organisation')} />;
  else if (error) body = <LoadError message={error} onRetry={() => void load()} />;
  else if (!status?.enabled) body = <div className="pz-state w-muted">{t('Ausweise sind auf diesem Server noch nicht freigeschaltet.')}</div>;
  else if (!org) body = <div className="pz-state w-muted">{t('Nur Inhaber:innen und Admins einer Organisation können Ausweise verwalten.')}</div>;
  else if (org.onChain !== 'ready') body = <NotReady org={org} />;
  else {
    const ctx: TabContext = { token: token!, org, onError, reloadOrgs: () => void load() };
    body = (
      <>
        {notice && (
          <div className="cr-notice ws-error" role="alert">
            <span>{notice}</span>
            <button className="w-btn ghost" onClick={() => setNotice(null)}>
              {t('Schließen')}
            </button>
          </div>
        )}
        <CredTab key={`${org.accountId}:${tab}`} tab={tab} ctx={ctx} />
      </>
    );
  }

  return (
    <Frame title={t('Ausweise')} nav={TABS.map((x) => ({ id: x.id, label: t(x.label) }))} active={tab} onSelect={(id) => (setTab(id as Tab), setNotice(null))} actions={picker} wide>
      {body}
    </Frame>
  );
}
