import { supabase } from './supabase';

export type AccountRole = 'owner' | 'admin' | 'member';

/** Get a user's role in an account. Returns null if not a member. */
export async function getAccountRole(
  accountId: string,
  walletAddress: string
): Promise<AccountRole | null> {
  const { data } = await supabase
    .from('account_owners')
    .select('role')
    .eq('account_id', accountId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle();

  return (data?.role as AccountRole) ?? null;
}

/** Check if a role can edit/delete events. */
export function canEditEvents(role: AccountRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** Check if a role can edit/delete listings and deals (owner or admin). */
export function canEditListings(role: AccountRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** Check if a role can manage members (invite/remove/change roles). */
export function canManageMembers(role: AccountRole | null): boolean {
  return role === 'owner';
}

/** Check if a user can leave an org (not the sole owner). */
export function canLeaveOrg(role: AccountRole | null, ownerCount: number): boolean {
  if (!role) return false;
  if (role === 'owner' && ownerCount <= 1) return false;
  return true;
}

/** Update a member's role in an account. */
export async function updateMemberRole(
  accountId: string,
  walletAddress: string,
  newRole: AccountRole
): Promise<void> {
  await supabase
    .from('account_owners')
    .update({ role: newRole })
    .eq('account_id', accountId)
    .eq('wallet_address', walletAddress.toLowerCase());
}
