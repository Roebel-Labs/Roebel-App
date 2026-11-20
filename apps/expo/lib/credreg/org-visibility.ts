/**
 * Where the org side of the register shows up (org manage row "Mitglieder & Ausweise", the
 * dashboard tile): only when the gate is open AND the active org is on chain (orgs_list
 * `onChain === 'ready'`). Every other org keeps exactly today's screens. The orgs list is read
 * once per wallet per app session; a failed read hides the entries (fail closed) and is tried
 * again on the next mount.
 */
import { useEffect, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { useAccount } from '@/context/AccountContext';
import type { SigningAccount } from '@/lib/signed-request';
import { fetchOrgs } from './api';
import { useCredentialsGate } from './gate';
import type { OrgListEntry } from './types';

export function orgCredentialsVisible(p: { gate: boolean | null; onChain: OrgListEntry['onChain'] | null | undefined }): boolean {
  return p.gate === true && p.onChain === 'ready';
}

const sessionOrgs = new Map<string, Promise<OrgListEntry[] | null>>();

/** orgs_list for this wallet, cached for the session (failures are not cached). */
export function sessionOrgList(account: SigningAccount): Promise<OrgListEntry[] | null> {
  const key = account.address.toLowerCase();
  let p = sessionOrgs.get(key);
  if (!p) {
    p = fetchOrgs(account).then(
      (res) => {
        if (!res.ok) { sessionOrgs.delete(key); return null; }
        return res.data;
      },
      () => { sessionOrgs.delete(key); return null; },
    );
    sessionOrgs.set(key, p);
  }
  return p;
}

/** Test hook. */
export function __resetSessionOrgs(): void {
  sessionOrgs.clear();
}

/** True only when the register entries may show for the active org (owner/admin, gate open, on chain). */
export function useOrgCredentialsVisible(): boolean {
  const gate = useCredentialsGate();
  const account = useActiveAccount();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const accountId = activeAccount?.account_type === 'organisation' ? activeAccount.id : null;
  const allowedRole = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';
  const [onChain, setOnChain] = useState<{ key: string; value: OrgListEntry['onChain'] | null } | null>(null);
  const key = `${account?.address?.toLowerCase() ?? ''}:${accountId ?? ''}`;

  useEffect(() => {
    if (gate !== true || !account || !accountId || !allowedRole) return;
    let cancelled = false;
    sessionOrgList(account).then((orgs) => {
      if (cancelled) return;
      setOnChain({ key, value: orgs?.find((o) => o.accountId === accountId)?.onChain ?? null });
    });
    return () => { cancelled = true; };
    // the account object changes identity on re-render; the key carries what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, key, allowedRole]);

  if (!allowedRole) return false;
  return orgCredentialsVisible({ gate, onChain: onChain && onChain.key === key ? onChain.value : null });
}
