import { supabase } from './supabase';
import type { OrgSubType } from './types';

export type AccountSearchScope = 'all' | 'personal' | 'organisation';

export interface AccountSearchResult {
  id: string;
  accountType: 'personal' | 'organisation';
  subType: OrgSubType | null;
  name: string;
  slug: string | null;
  username: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
}

type RpcRow = {
  id: string;
  account_type: 'personal' | 'organisation';
  sub_type: OrgSubType | null;
  name: string;
  slug: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  username: string | null;
  match_rank: number;
};

export async function searchAccounts(
  query: string,
  scope: AccountSearchScope,
  excludeAccountId: string | null
): Promise<AccountSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await (supabase.rpc as any)('search_accounts', {
    p_query: trimmed,
    p_scope: scope,
    p_exclude: excludeAccountId,
    p_limit: 30,
  });

  if (error) {
    console.error('searchAccounts error:', error);
    return [];
  }

  return ((data as RpcRow[] | null) ?? []).map((r) => ({
    id: r.id,
    accountType: r.account_type,
    subType: r.sub_type,
    name: r.name,
    slug: r.slug,
    username: r.username,
    avatarUrl: r.avatar_url,
    isVerified: r.is_verified,
  }));
}
