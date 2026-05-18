import { supabase } from './supabase';
import type { Account, UserRecord } from './types';

export type AttesterProfile = {
  wallet: string;
  user: UserRecord | null;
  orgs: Account[];
};

export async function fetchAttesterProfiles(wallets: string[]): Promise<AttesterProfile[]> {
  const normalized = Array.from(new Set(wallets.map((w) => w.toLowerCase()))).filter(Boolean);
  if (normalized.length === 0) return [];

  const [usersRes, ownersRes] = await Promise.all([
    supabase.from('users').select('*').in('wallet_address', normalized),
    supabase
      .from('account_owners' as any)
      .select('wallet_address, account_id, accounts:account_id(*)')
      .in('wallet_address', normalized),
  ]);

  if (usersRes.error) {
    console.error('fetchAttesterProfiles users error:', usersRes.error);
  }
  if (ownersRes.error) {
    console.error('fetchAttesterProfiles owners error:', ownersRes.error);
  }

  const userByWallet = new Map<string, UserRecord>();
  for (const u of (usersRes.data as UserRecord[] | null) ?? []) {
    if (u.wallet_address) userByWallet.set(u.wallet_address.toLowerCase(), u);
  }

  const orgsByWallet = new Map<string, Account[]>();
  for (const row of (ownersRes.data as any[] | null) ?? []) {
    const wallet = (row.wallet_address as string | null)?.toLowerCase();
    const account = row.accounts as Account | null;
    if (!wallet || !account) continue;
    if (account.account_type !== 'organisation') continue;
    const list = orgsByWallet.get(wallet) ?? [];
    list.push(account);
    orgsByWallet.set(wallet, list);
  }

  const profiles: AttesterProfile[] = normalized.map((wallet) => ({
    wallet,
    user: userByWallet.get(wallet) ?? null,
    orgs: orgsByWallet.get(wallet) ?? [],
  }));

  return profiles.sort((a, b) => {
    if (a.orgs.length !== b.orgs.length) return b.orgs.length - a.orgs.length;
    const an = a.orgs[0]?.name ?? a.user?.username ?? a.wallet;
    const bn = b.orgs[0]?.name ?? b.user?.username ?? b.wallet;
    return an.localeCompare(bn);
  });
}
