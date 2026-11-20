// Whether a card design may be published from this phone. Drafting works for every owner/admin
// org while the designer is on; publishing needs the register switched on (gate) and the org in
// the register (orgs_list onChain === 'ready'). Fail closed while unknown.
import { useEffect, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { sessionOrgList } from '@/lib/credreg/org-visibility';
import type { OrgListEntry } from '@/lib/credreg/types';

export const PUBLISH_NOT_IN_REGISTER = 'Veröffentlichen geht, sobald eure Organisation im Register eingetragen ist.';
export const PUBLISH_REGISTER_OFF = 'Veröffentlichen geht, sobald das Ausweis-Register freigeschaltet ist.';

export type PublishGate = { allowed: true } | { allowed: false; loading: boolean; reason: string | null };

export function publishGate(p: { gate: boolean | null; onChain: OrgListEntry['onChain'] | null | undefined; loading?: boolean }): PublishGate {
  if (p.gate === null || p.loading) return { allowed: false, loading: true, reason: null };
  if (p.gate === false) return { allowed: false, loading: false, reason: PUBLISH_REGISTER_OFF };
  if (p.onChain === 'ready') return { allowed: true };
  return { allowed: false, loading: false, reason: PUBLISH_NOT_IN_REGISTER };
}

/** The publish gate for one org (null accountId = unknown org → not allowed). */
export function usePublishGate(accountId: string | null | undefined): PublishGate {
  const gate = useCredentialsGate();
  const account = useActiveAccount();
  const [entry, setEntry] = useState<{ key: string; onChain: OrgListEntry['onChain'] | null } | null>(null);
  const key = `${account?.address?.toLowerCase() ?? ''}:${accountId ?? ''}`;
  useEffect(() => {
    if (gate !== true || !account || !accountId) return;
    let alive = true;
    sessionOrgList(account).then((orgs) => {
      if (alive) setEntry({ key, onChain: orgs?.find((o) => o.accountId === accountId)?.onChain ?? null });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, key]);
  const known = entry && entry.key === key ? entry : null;
  return publishGate({ gate, onChain: known?.onChain ?? null, loading: gate === true && !!account && !!accountId && !known });
}
