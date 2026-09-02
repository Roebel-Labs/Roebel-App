/**
 * "Merken" / "Gewesen" — a person's save state for an organisation.
 *
 * One row per (org, wallet) carrying a single state, so marking a place
 * "Gewesen" replaces having merely merkt it rather than stacking on top. That
 * keeps the "Gespeichert von" rail to one badge per face.
 */
import { supabase } from './supabase';
import type { AccountSave, AccountSaveSummary, AccountSaveState, SaverProfile } from './types';

export async function fetchAccountSaveSummary(
  accountId: string
): Promise<AccountSaveSummary | null> {
  const { data, error } = await supabase
    .from('account_save_summary')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('fetchAccountSaveSummary error:', error);
    return null;
  }
  return (data as AccountSaveSummary | null) ?? null;
}

export async function fetchMyAccountSave(
  accountId: string,
  wallet: string
): Promise<AccountSave | null> {
  const { data, error } = await supabase
    .from('account_saves')
    .select('*')
    .eq('account_id', accountId)
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('fetchMyAccountSave error:', error);
    return null;
  }
  return (data as AccountSave | null) ?? null;
}

/**
 * The faces under "Gespeichert von", newest first.
 *
 * Capped rather than paginated: the rail shows a handful of avatars and a
 * count, so pulling the whole save list would be waste.
 */
export async function fetchAccountSavers(
  accountId: string,
  limit = 12
): Promise<SaverProfile[]> {
  const { data, error } = await supabase
    .from('account_saves')
    .select(
      `state, created_at,
       user:users!account_saves_wallet_address_fkey(wallet_address, username, profile_picture_url)`
    )
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('fetchAccountSavers error:', error);
    return [];
  }

  type Row = {
    state: AccountSaveState;
    user: { wallet_address: string; username: string | null; profile_picture_url: string | null } | null;
  };

  return ((data as Row[]) ?? [])
    .filter((row): row is Row & { user: NonNullable<Row['user']> } => !!row.user)
    .map((row) => ({
      wallet_address: row.user.wallet_address,
      username: row.user.username,
      profile_picture_url: row.user.profile_picture_url,
      state: row.state,
    }));
}

/**
 * Set the viewer's state. Passing the state they already hold clears it, so
 * the buttons behave as toggles.
 */
export async function setAccountSave(
  accountId: string,
  wallet: string,
  state: AccountSaveState
): Promise<AccountSaveState | null> {
  const address = wallet.toLowerCase();
  const existing = await fetchMyAccountSave(accountId, address);

  if (existing?.state === state) {
    await clearAccountSave(accountId, address);
    return null;
  }

  const { error } = await supabase.from('account_saves').upsert(
    {
      account_id: accountId,
      wallet_address: address,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id,wallet_address' }
  );

  if (error) {
    console.error('setAccountSave error:', error);
    return existing?.state ?? null;
  }
  return state;
}

export async function clearAccountSave(accountId: string, wallet: string): Promise<void> {
  const { error } = await supabase
    .from('account_saves')
    .delete()
    .eq('account_id', accountId)
    .eq('wallet_address', wallet.toLowerCase());
  if (error) console.error('clearAccountSave error:', error);
}
