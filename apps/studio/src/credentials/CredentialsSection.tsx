// "Ausweise": an org admin manages credential types, people, batches, event badges and delegates.
// Studio cannot sign: every change is prepared here and confirmed in the Röbel App on the phone.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { Frame, LoadError, SignedOutHint, useSessionToken } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { fetchDesignOrgs, fetchOrgs, fetchStatus, isSessionError } from './api';
import type { CredentialsStatus, DesignOrg, OrgListItem } from './types';
import { CredTab, type TabContext } from './tabs';
import '../persona/persona.css';
import './credentials.css';

export type Tab = 'types' | 'people' | 'batches' | 'events' | 'settings';
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'types', label: 'Typen' },
  { id: 'people', label: 'Personen' },
  { id: 'batches', label: 'Ausstellungen' },
  { id: 'events', label: 'Veranstaltungen' },
  { id: 'settings', label: 'Einstellungen' },
];

export type SectionView =
  | { kind: 'off' }
  | { kind: 'not-ready' }
  | { kind: 'open'; tabs: Tab[]; register: boolean; designer: boolean; notReady?: true };

/**
 * What the section offers for the selected org. With the card designer switched on the section opens
 * even while the register is off (or the org is not in it yet): then only Typen (drafts and the
 * designer) is offered and nothing can be published.
 */
export function sectionView(status: CredentialsStatus, org: OrgListItem): SectionView {
  const registerOn = status.enabled && status.configured;
  if (registerOn && org.onChain === 'ready') return { kind: 'open', tabs: TABS.map((x) => x.id), register: true, designer: status.designer };
  if (!status.designer) return registerOn ? { kind: 'not-ready' } : { kind: 'off' };
  return registerOn ? { kind: 'open', tabs: ['types'], register: false, designer: true, notReady: true } : { kind: 'open', tabs: ['types'], register: false, designer: true };
}

/** A design org (register off) in the shape of the register's org list; not on chain as far as Studio knows. */
const fromDesignOrg = (o: DesignOrg): OrgListItem => ({
  accountId: o.accountId,
  name: o.name,
  avatarUrl: o.avatarUrl,
  subType: null,
  role: o.role,
  membersMayBePublic: false,
  onChain: 'org_not_registered',
});

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
      // While the register is off the org routes answer 503: ask for orgs only when it is on. The
      // designer has its own org list (design_orgs) that works without the register.
      const s = await fetchStatus();
      const o = s.enabled && s.configured ? await fetchOrgs(token) : s.designer ? (await fetchDesignOrgs(token)).map(fromDesignOrg) : [];
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
  const view: SectionView | null = status && org ? sectionView(status, org) : null;
  const tabs = view?.kind === 'open' ? TABS.filter((x) => view.tabs.includes(x.id)) : TABS;
  const shownTab: Tab = tabs.some((x) => x.id === tab) ? tab : 'types';
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
  else if (!status || (!status.designer && (!status.enabled || !status.configured))) body = <div className="pz-state w-muted">{t('Ausweise sind auf diesem Server noch nicht freigeschaltet.')}</div>;
  else if (!org || !view) body = <div className="pz-state w-muted">{t('Nur Inhaber:innen und Admins einer Organisation können Ausweise verwalten.')}</div>;
  else if (view.kind === 'off') body = <div className="pz-state w-muted">{t('Ausweise sind auf diesem Server noch nicht freigeschaltet.')}</div>;
  else if (view.kind === 'not-ready') body = <NotReady org={org} />;
  else {
    const ctx: TabContext = { token: token!, org, onError, reloadOrgs: () => void load(), register: view.register, designer: view.designer };
    body = (
      <>
        {view.notReady && <NotReady org={org} />}
        {notice && (
          <div className="cr-notice ws-error" role="alert">
            <span>{notice}</span>
            <button className="w-btn ghost" onClick={() => setNotice(null)}>
              {t('Schließen')}
            </button>
          </div>
        )}
        <CredTab key={`${org.accountId}:${shownTab}`} tab={shownTab} ctx={ctx} />
      </>
    );
  }

  return (
    <Frame title={t('Ausweise')} nav={tabs.map((x) => ({ id: x.id, label: t(x.label) }))} active={shownTab} onSelect={(id) => (setTab(id as Tab), setNotice(null))} actions={picker} wide>
      {body}
    </Frame>
  );
}
