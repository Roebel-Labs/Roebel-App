/**
 * Org owners for the bulk org-Safe action: every organisation the wallet OWNS,
 * with that org's full owner list (the future Safe owners).
 */
import { supabase } from '../supabase';
import type { BulkOrg } from './ops';
import type { OrgRef } from './requests';

export type OwnedOrg = BulkOrg & { name: string };

export async function fetchOwnedOrgsWithOwners(wallet: string): Promise<OwnedOrg[]> {
  const me = wallet.toLowerCase();
  const { data: mine, error } = await (supabase.from('account_owners') as any)
    .select('account_id, accounts!inner(id, name, account_type)')
    .eq('wallet_address', me)
    .eq('role', 'owner')
    .eq('accounts.account_type', 'organisation');
  if (error) throw error;
  const orgs = (mine ?? []) as { account_id: string; accounts: { name: string } }[];
  if (orgs.length === 0) return [];

  const { data: owners, error: e2 } = await (supabase.from('account_owners') as any)
    .select('account_id, wallet_address')
    .in('account_id', orgs.map((o) => o.account_id))
    .eq('role', 'owner');
  if (e2) throw e2;
  const byOrg = new Map<string, string[]>();
  for (const row of (owners ?? []) as { account_id: string; wallet_address: string }[]) {
    const list = byOrg.get(row.account_id) ?? [];
    list.push(row.wallet_address);
    byOrg.set(row.account_id, list);
  }
  return orgs
    .map((o) => ({ uuid: o.account_id, name: o.accounts.name, owners: byOrg.get(o.account_id) ?? [me] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Every organisation (id, name, avatar) — the attester inbox resolves org ids against it. */
export async function fetchOrgRefs(): Promise<OrgRef[]> {
  const { data, error } = await (supabase.from('accounts') as any)
    .select('id, name, avatar_url')
    .eq('account_type', 'organisation');
  if (error) throw error;
  return (data ?? []) as OrgRef[];
}
