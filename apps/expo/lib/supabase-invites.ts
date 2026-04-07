import { supabase } from './supabase';
import type { InviteToken, InviteTokenWithUser, InviteTokenWithAccount, UserNotification, Account } from './types';

// ── Create ──────────────────────────────────────────────────────────

/** Create an in-app invite: inserts invite_tokens row + notifications row. */
export async function createInAppInvite(
  accountId: string,
  invitedWallet: string,
  role: 'admin' | 'member',
  invitedBy: string,
  expiresInDays: number = 7
): Promise<{ invite: InviteToken; notification: UserNotification }> {
  const normalized = invitedWallet.toLowerCase();
  const inviterNormalized = invitedBy.toLowerCase();

  // Fetch account name for notification text
  const { data: account } = await (supabase.from('accounts') as any)
    .select('name')
    .eq('id', accountId)
    .single();

  const orgName = (account as any)?.name || 'Organisation';
  const roleLabel = role === 'admin' ? 'Admin' : 'Mitglied';

  // Insert invite token
  const { data: invite, error: inviteError } = await (supabase.from('invite_tokens') as any)
    .insert({
      account_id: accountId,
      role,
      invited_by: inviterNormalized,
      invited_wallet: normalized,
      expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (inviteError) {
    console.error('createInAppInvite token error:', inviteError);
    throw inviteError;
  }

  const inviteData = invite as InviteToken;

  // Insert notification for the recipient
  const { data: notification, error: notifError } = await (supabase.from('notifications') as any)
    .insert({
      recipient_wallet: normalized,
      type: 'org_invite',
      title: `Einladung von ${orgName}`,
      body: `Du wurdest als ${roleLabel} eingeladen`,
      metadata: {
        account_id: accountId,
        role,
        invitation_id: inviteData.id,
      },
    })
    .select()
    .single();

  if (notifError) {
    console.error('createInAppInvite notification error:', notifError);
    throw notifError;
  }

  return { invite: inviteData, notification: notification as UserNotification };
}

/** Create a link invite: inserts invite_tokens row, returns token for URL. */
export async function createLinkInvite(
  accountId: string,
  role: 'admin' | 'member',
  invitedBy: string,
  expiresInDays: number = 7
): Promise<InviteToken> {
  const { data, error } = await (supabase.from('invite_tokens') as any)
    .insert({
      account_id: accountId,
      role,
      invited_by: invitedBy.toLowerCase(),
      invited_wallet: null,
      expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('createLinkInvite error:', error);
    throw error;
  }

  return data as InviteToken;
}

// ── Resolve ─────────────────────────────────────────────────────────

/** Accept an invite: updates status, inserts into account_owners, updates notification. */
export async function acceptInvite(inviteId: string, acceptingWallet: string): Promise<void> {
  const normalized = acceptingWallet.toLowerCase();

  // Fetch the invite
  const { data: invite, error: fetchErr } = await (supabase.from('invite_tokens') as any)
    .select('*')
    .eq('id', inviteId)
    .single();

  if (fetchErr || !invite) {
    throw new Error('Einladung nicht gefunden');
  }

  const inv = invite as InviteToken;

  if (inv.status !== 'pending') {
    throw new Error('Diese Einladung ist nicht mehr gültig');
  }

  if (new Date(inv.expires_at) < new Date()) {
    // Mark as expired
    await (supabase.from('invite_tokens') as any)
      .update({ status: 'expired' })
      .eq('id', inviteId);
    throw new Error('Diese Einladung ist abgelaufen');
  }

  // Update invite status
  const { error: updateErr } = await (supabase.from('invite_tokens') as any)
    .update({ status: 'accepted' })
    .eq('id', inviteId);

  if (updateErr) throw updateErr;

  // Insert into account_owners
  const { error: ownerErr } = await (supabase.from('account_owners') as any)
    .insert({
      account_id: inv.account_id,
      wallet_address: normalized,
      role: inv.role,
      invited_by: inv.invited_by,
    });

  if (ownerErr) {
    console.error('acceptInvite account_owners insert error:', ownerErr);
    throw ownerErr;
  }

  // Update the notification if it exists
  if (inv.invited_wallet) {
    await (supabase.from('notifications') as any)
      .update({ is_read: true })
      .eq('type', 'org_invite')
      .contains('metadata', { invitation_id: inviteId });
  }
}

/** Decline an invite. */
export async function declineInvite(inviteId: string): Promise<void> {
  const { error } = await (supabase.from('invite_tokens') as any)
    .update({ status: 'declined' })
    .eq('id', inviteId);

  if (error) throw error;

  // Mark notification as read
  await (supabase.from('notifications') as any)
    .update({ is_read: true })
    .eq('type', 'org_invite')
    .contains('metadata', { invitation_id: inviteId });
}

/** Revoke a pending invite (owner action). */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await (supabase.from('invite_tokens') as any)
    .update({ status: 'revoked' })
    .eq('id', inviteId);

  if (error) throw error;

  // Delete the notification
  await (supabase.from('notifications') as any)
    .delete()
    .eq('type', 'org_invite')
    .contains('metadata', { invitation_id: inviteId });
}

// ── Queries ─────────────────────────────────────────────────────────

/** Fetch pending invites for an account (for the Verwalten page). */
export async function fetchPendingInvites(accountId: string): Promise<InviteTokenWithUser[]> {
  const { data, error } = await (supabase.from('invite_tokens') as any)
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchPendingInvites error:', error);
    return [];
  }

  const invites = data as InviteToken[];

  // Enrich with user data for in-app invites
  const enriched: InviteTokenWithUser[] = await Promise.all(
    invites.map(async (inv) => {
      if (!inv.invited_wallet) return inv;

      const { data: userData } = await supabase
        .from('users')
        .select('username, profile_picture_url, tier')
        .eq('wallet_address', inv.invited_wallet)
        .maybeSingle();

      return {
        ...inv,
        invited_user: userData || undefined,
      } as InviteTokenWithUser;
    })
  );

  return enriched;
}

/** Fetch an invite by its token (for link invite landing page). */
export async function fetchInviteByToken(token: string): Promise<InviteTokenWithAccount | null> {
  const { data, error } = await (supabase.from('invite_tokens') as any)
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) return null;

  const invite = data as InviteToken;

  // Fetch account details
  const { data: account } = await (supabase.from('accounts') as any)
    .select('*')
    .eq('id', invite.account_id)
    .single();

  // Fetch inviter details
  const { data: inviter } = await supabase
    .from('users')
    .select('username, profile_picture_url')
    .eq('wallet_address', invite.invited_by)
    .maybeSingle();

  return {
    ...invite,
    account: account as Account,
    inviter: inviter || undefined,
  };
}

/** Check if user already has a pending invite for this account. */
export async function hasPendingInvite(
  accountId: string,
  walletAddress: string
): Promise<boolean> {
  const { data } = await (supabase.from('invite_tokens') as any)
    .select('id')
    .eq('account_id', accountId)
    .eq('invited_wallet', walletAddress.toLowerCase())
    .eq('status', 'pending')
    .maybeSingle();

  return !!data;
}
