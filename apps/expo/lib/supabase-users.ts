import { supabase } from './supabase';
import { createPersonalAccount } from './supabase-accounts';
import type { UserRecord, UserTier } from './types';

/**
 * Fetch user by wallet address
 */
export async function fetchUserByWallet(walletAddress: string): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found
    console.error('Error fetching user:', error);
    return null;
  }

  return data as UserRecord;
}

/**
 * Create or fetch user on login.
 * First login: creates with tier='tourist' and a personal account.
 * Returning login: updates last_login_at and email only (preserves tier).
 */
export async function upsertUser(walletAddress: string, email?: string): Promise<UserRecord | null> {
  const normalizedAddress = walletAddress.toLowerCase();

  // Try to fetch existing user first
  const existing = await fetchUserByWallet(normalizedAddress);
  if (existing) {
    // Update last_login_at and email if provided
    const updates: Record<string, unknown> = { last_login_at: new Date().toISOString() };
    if (email) updates.email = email;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('wallet_address', normalizedAddress)
      .select()
      .single();

    if (error) {
      console.error('Error updating user login:', error);
      return existing;
    }
    return data as UserRecord;
  }

  // Create new user with default tier 'tourist'
  const { data, error } = await supabase
    .from('users')
    .insert({
      wallet_address: normalizedAddress,
      tier: 'tourist' as UserTier,
      ...(email && { email }),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
    return null;
  }

  const newUser = data as UserRecord;

  // Create personal account for new user
  const displayName = newUser.username || normalizedAddress.slice(0, 10) + '...';
  await createPersonalAccount(normalizedAddress, displayName, newUser.profile_picture_url);

  // Re-fetch to get active_account_id
  return fetchUserByWallet(normalizedAddress);
}

/**
 * Update user profile fields (username, bio, profile picture)
 */
export async function updateUserProfile(
  walletAddress: string,
  updates: Partial<Pick<UserRecord, 'username' | 'bio' | 'profile_picture_url' | 'cover_image_url' | 'neighborhood' | 'interests'>>
): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('wallet_address', walletAddress.toLowerCase())
    .select()
    .single();

  if (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }

  return data as UserRecord;
}

/**
 * Update user tier (called when verification status changes)
 */
export async function updateUserTier(
  walletAddress: string,
  tier: UserTier,
  isVerifiedCitizen?: boolean
): Promise<void> {
  const updates: Record<string, unknown> = { tier };
  if (isVerifiedCitizen !== undefined) {
    updates.is_verified_citizen = isVerifiedCitizen;
    if (isVerifiedCitizen) {
      updates.citizen_verification_date = new Date().toISOString();
      updates.verification_status = 'approved';
    }
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('wallet_address', walletAddress.toLowerCase());

  if (error) {
    console.error('Error updating user tier:', error);
    throw error;
  }
}

// Backward compatibility alias
export const updateUserRole = updateUserTier;

/**
 * Persist Mecky onboarding results.
 * Always stamps onboarding_completed_at so the full wizard never re-opens.
 * Only stamps terms_accepted_at when the user taps "Akzeptieren" on the consent screen;
 * leaving it null triggers the consent-only re-prompt on every subsequent cold start.
 */
export async function updateUserOnboarding(
  walletAddress: string,
  updates: {
    username?: string | null;
    preferredRole?: 'buerger' | 'tourist' | null;
    termsAccepted?: boolean;
    markCompleted?: boolean;
  }
): Promise<UserRecord | null> {
  const patch: Record<string, unknown> = {};
  if (updates.username !== undefined) patch.username = updates.username;
  if (updates.preferredRole !== undefined) patch.preferred_role = updates.preferredRole;
  if (updates.markCompleted) patch.onboarding_completed_at = new Date().toISOString();
  if (updates.termsAccepted) patch.terms_accepted_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('wallet_address', walletAddress.toLowerCase())
    .select()
    .single();

  if (error) {
    console.error('Error updating onboarding:', error);
    throw error;
  }

  return data as UserRecord;
}
