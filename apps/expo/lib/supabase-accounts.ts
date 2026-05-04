import { supabase } from './supabase';
import type { Account, AccountOwner, AccountType, OrgSubType } from './types';

export type CreateOrgAccountOptions = {
  /** Mark this org as extern (non-Röbel). Stored as extern_status='pending'. */
  isExtern?: boolean;
  /** Contact email for approval notifications. */
  contactEmail?: string | null;
  /** Free-text "why I want an account" — shown to admin reviewer. */
  reason?: string | null;
  /** Optional bio/description. */
  bio?: string | null;
};

function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueAccountSlug(base: string): Promise<string> {
  const baseSlug = base || 'org';
  let slug = baseSlug;
  let n = 1;
  while (true) {
    const { data } = await supabase
      .from('accounts' as any)
      .select('id')
      .eq('slug', slug)
      .limit(1);
    if (!data || (data as any[]).length === 0) return slug;
    n += 1;
    slug = `${baseSlug}-${n}`;
  }
}

// ── Fetch ────────────────────────────────────────────────────

export async function fetchAccountById(accountId: string): Promise<Account | null> {
  const { data, error } = await supabase
    .from('accounts' as any)
    .select('*')
    .eq('id', accountId)
    .single();

  if (error) {
    console.error('fetchAccountById error:', error);
    return null;
  }
  return data as Account;
}

export async function fetchOwnedAccounts(walletAddress: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('account_owners' as any)
    .select('account_id, accounts:account_id(*)')
    .eq('wallet_address', walletAddress.toLowerCase());

  if (error) {
    console.error('fetchOwnedAccounts error:', error);
    return [];
  }

  return (data as any[]).map((row) => row.accounts).filter(Boolean) as Account[];
}

export async function fetchAccountOwners(accountId: string): Promise<AccountOwner[]> {
  const { data, error } = await supabase
    .from('account_owners' as any)
    .select('*')
    .eq('account_id', accountId);

  if (error) {
    console.error('fetchAccountOwners error:', error);
    return [];
  }
  return data as AccountOwner[];
}

export async function isAccountOwner(accountId: string, walletAddress: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('account_owners' as any)
    .select('account_id')
    .eq('account_id', accountId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('isAccountOwner error:', error);
    return false;
  }
  return !!data;
}

// ── Create ───────────────────────────────────────────────────

export async function createPersonalAccount(
  walletAddress: string,
  name: string,
  avatarUrl?: string | null
): Promise<Account | null> {
  const normalized = walletAddress.toLowerCase();

  // Insert the account
  const { data: account, error: accError } = await supabase
    .from('accounts' as any)
    .insert({
      account_type: 'personal' as AccountType,
      name,
      avatar_url: avatarUrl || null,
    })
    .select()
    .single();

  if (accError) {
    console.error('createPersonalAccount error:', accError);
    return null;
  }

  const acc = account as Account;

  // Link owner
  const { error: ownerError } = await supabase
    .from('account_owners' as any)
    .insert({
      account_id: acc.id,
      wallet_address: normalized,
    });

  if (ownerError) {
    console.error('createPersonalAccount owner link error:', ownerError);
  }

  // Set as active account
  await supabase
    .from('users')
    .update({ active_account_id: acc.id })
    .eq('wallet_address', normalized);

  return acc;
}

export async function createOrgAccount(
  walletAddress: string,
  subType: OrgSubType,
  name: string,
  options: CreateOrgAccountOptions = {}
): Promise<Account | null> {
  const normalized = walletAddress.toLowerCase();
  const isExtern = !!options.isExtern;
  const slug = await uniqueAccountSlug(generateSlug(name));

  const { data: account, error: accError } = await supabase
    .from('accounts' as any)
    .insert({
      account_type: 'organisation' as AccountType,
      sub_type: subType,
      name,
      slug,
      bio: options.bio ?? null,
      contact_email: options.contactEmail ?? null,
      is_extern: isExtern,
      extern_status: isExtern ? 'pending' : null,
      extern_reason: isExtern ? options.reason ?? null : null,
    })
    .select()
    .single();

  if (accError) {
    console.error('createOrgAccount error:', accError);
    return null;
  }

  const acc = account as Account;

  // Link creator as owner
  const { error: ownerError } = await supabase
    .from('account_owners' as any)
    .insert({
      account_id: acc.id,
      wallet_address: normalized,
    });

  if (ownerError) {
    console.error('createOrgAccount owner link error:', ownerError);
  }

  return acc;
}

// ── Switch ───────────────────────────────────────────────────

export async function switchActiveAccount(
  walletAddress: string,
  accountId: string
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ active_account_id: accountId })
    .eq('wallet_address', walletAddress.toLowerCase());

  if (error) {
    console.error('switchActiveAccount error:', error);
    throw error;
  }
}

// ── Invite / Remove Owners ───────────────────────────────────

export async function inviteOwner(
  accountId: string,
  walletAddress: string,
  invitedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('account_owners' as any)
    .insert({
      account_id: accountId,
      wallet_address: walletAddress.toLowerCase(),
      invited_by: invitedBy.toLowerCase(),
    });

  if (error) {
    console.error('inviteOwner error:', error);
    throw error;
  }
}

export async function removeOwner(accountId: string, walletAddress: string): Promise<void> {
  // Prevent removing the last owner
  const owners = await fetchAccountOwners(accountId);
  if (owners.length <= 1) {
    throw new Error('Cannot remove the last owner of an account');
  }

  const { error } = await supabase
    .from('account_owners' as any)
    .delete()
    .eq('account_id', accountId)
    .eq('wallet_address', walletAddress.toLowerCase());

  if (error) {
    console.error('removeOwner error:', error);
    throw error;
  }
}

// ── Delete ───────────────────────────────────────────────────

export async function deleteAccount(accountId: string): Promise<void> {
  // .select() forces Supabase to return the deleted rows so we can verify
  // the operation actually affected the DB. RLS without a DELETE policy
  // silently denies the statement (success, 0 rows) — without this check
  // the caller would think it succeeded and de-sync local state from the DB.
  const { data, error } = await supabase
    .from('accounts' as any)
    .delete()
    .eq('id', accountId)
    .select('id');

  if (error) {
    console.error('deleteAccount error:', error);
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error(
      'Konto konnte nicht gelöscht werden (keine Berechtigung oder bereits entfernt).',
    );
  }
}

// ── Update ───────────────────────────────────────────────────

export async function updateAccount(
  accountId: string,
  updates: Partial<Pick<Account, 'name' | 'bio' | 'avatar_url' | 'cover_url'>>
): Promise<Account | null> {
  const { data, error } = await supabase
    .from('accounts' as any)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .select()
    .single();

  if (error) {
    console.error('updateAccount error:', error);
    throw error;
  }
  return data as Account;
}
