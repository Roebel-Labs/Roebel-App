import { orgsFirst } from './follow-selection';
import { supabase } from './supabase';
import { pickDisplayName } from './post-author';

export type FollowSuggestion = {
  account_id: string; name: string; avatar_url: string | null;
  account_type: 'personal' | 'organisation'; sub_type: string | null; followers: number;
};

export async function fetchFollowSuggestions(): Promise<FollowSuggestion[]> {
  const { data, error } = await supabase.rpc('get_follow_suggestions');
  if (error) { console.error('get_follow_suggestions failed', error); return []; }
  return orgsFirst((data ?? []) as FollowSuggestion[]);
}

export async function fetchFollowStats(accountId: string): Promise<{ followers: number; following: number }> {
  const { data, error } = await (supabase as any).rpc('get_follow_stats', { p_account_id: accountId });
  if (error || !data) return { followers: 0, following: 0 };
  return { followers: Number((data as any).followers ?? 0), following: Number((data as any).following ?? 0) };
}

export async function fetchPersonalAccountId(wallet: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc('personal_account_id', { p_wallet: wallet });
  return error ? null : ((data as string | null) ?? null);
}

export type AccountDisplay = {
  account_id: string;
  /** Never wallet-shaped; null when the account has no usable name. */
  name: string | null;
  avatar_url: string | null;
  account_type: 'personal' | 'organisation';
  sub_type: string | null;
  /** Lowercased owner wallets of a personal account, oldest owner first ([] for orgs). */
  ownerWallets: string[];
};

const IN_CHUNK = 100;

async function selectIn<T>(table: string, columns: string, column: string, values: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const { data, error } = await (supabase as any).from(table).select(columns).in(column, values.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/**
 * Display rows for arbitrary account ids. Organisations are named by accounts.name; persons by
 * their oldest owner's users.display_name → username (personal accounts.name is mostly a wallet
 * string). Wallet-shaped names are never returned. Throws on any query error.
 */
export async function fetchAccountDisplays(ids: string[]): Promise<AccountDisplay[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const accounts = await selectIn<{ id: string; name: string | null; avatar_url: string | null; account_type: string; sub_type: string | null }>(
    'accounts', 'id,name,avatar_url,account_type,sub_type', 'id', unique);
  const personalIds = accounts.filter((a) => a.account_type !== 'organisation').map((a) => a.id);
  const owners = personalIds.length === 0 ? [] : await selectIn<{ account_id: string; wallet_address: string; joined_at: string | null }>(
    'account_owners', 'account_id,wallet_address,joined_at', 'account_id', personalIds);
  owners.sort((a, b) => (a.joined_at ?? '9999').localeCompare(b.joined_at ?? '9999'));
  // Both spellings: owner and user rows may differ in case (checksummed legacy rows).
  const wallets = [...new Set(owners.flatMap((o) => [o.wallet_address, o.wallet_address.toLowerCase()]))];
  const users = wallets.length === 0 ? [] : await selectIn<{ wallet_address: string; display_name: string | null; username: string | null; profile_picture_url: string | null }>(
    'users', 'wallet_address,display_name,username,profile_picture_url', 'wallet_address', wallets);
  const userByWallet = new Map(users.map((u) => [u.wallet_address.toLowerCase(), u]));

  return accounts.map((a) => {
    const isOrg = a.account_type === 'organisation';
    const ownerWallets = isOrg ? [] : [...new Set(owners.filter((o) => o.account_id === a.id).map((o) => o.wallet_address.toLowerCase()))];
    const user = ownerWallets.map((w) => userByWallet.get(w)).find(Boolean) ?? null;
    return {
      account_id: a.id,
      name: isOrg ? pickDisplayName(a.name) : pickDisplayName(user?.display_name, user?.username),
      avatar_url: a.avatar_url ?? (isOrg ? null : user?.profile_picture_url ?? null),
      account_type: isOrg ? 'organisation' : 'personal',
      sub_type: a.sub_type,
      ownerWallets,
    };
  });
}
