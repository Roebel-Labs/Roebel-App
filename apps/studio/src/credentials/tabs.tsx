// Tab switch of the Ausweise section; each tab gets the session token and the selected org.
import { t } from '../i18n';
import type { OrgListItem } from './types';
import { TypesTab } from './TypesTab';

export interface TabContext {
  token: string;
  org: OrgListItem;
  /** Reports an error; a lost session switches the section to the sign-in hint. */
  onError: (e: unknown) => void;
  reloadOrgs: () => void;
}

export function CredTab({ tab, ctx }: { tab: string; ctx: TabContext }) {
  if (tab === 'types') return <TypesTab ctx={ctx} />;
  return <div className="pz-state w-muted">{t('Kommt bald.')} ({tab})</div>;
}
