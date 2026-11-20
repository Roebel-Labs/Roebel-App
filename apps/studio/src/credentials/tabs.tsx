// Tab switch of the Ausweise section; each tab gets the session token and the selected org.
import type { OrgListItem } from './types';
import { TypesTab } from './TypesTab';
import { PeopleTab } from './PeopleTab';
import { BatchesTab } from './BatchesTab';
import { EventsTab } from './EventsTab';
import { SettingsTab } from './SettingsTab';

export interface TabContext {
  token: string;
  org: OrgListItem;
  /** Reports an error; a lost session switches the section to the sign-in hint. */
  onError: (e: unknown) => void;
  reloadOrgs: () => void;
  /** The register is on and the org is in it: types can be listed and designs published. */
  register: boolean;
  /** The card designer is switched on (drafts work without the register). */
  designer: boolean;
}

export function CredTab({ tab, ctx }: { tab: string; ctx: TabContext }) {
  if (tab === 'people') return <PeopleTab ctx={ctx} />;
  if (tab === 'batches') return <BatchesTab ctx={ctx} />;
  if (tab === 'events') return <EventsTab ctx={ctx} />;
  if (tab === 'settings') return <SettingsTab ctx={ctx} />;
  return <TypesTab ctx={ctx} />;
}
