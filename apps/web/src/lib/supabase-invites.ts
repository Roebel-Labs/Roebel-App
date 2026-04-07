/**
 * Invite token management — mirrors apps/expo/lib/supabase-invites.ts
 */

import { supabase } from "./supabase";
import type {
  InviteToken,
  InviteTokenWithUser,
  InviteTokenWithAccount,
  UserNotification,
  Account,
  OrgRole,
} from "@/types/account";

// ── Create ──────────────────────────────────────────────────────────

/** Create an in-app invite: inserts invite_tokens + notifications rows. */
export async function createInAppInvite(
  accountId: string,
  invitedWallet: string,
  role: "admin" | "member",
  invitedBy: string,
  expiresInDays = 7
): Promise<{ invite: InviteToken; notification: UserNotification }> {
  const normalized = invitedWallet.toLowerCase();
  const inviterNormalized = invitedBy.toLowerCase();

  const { data: account } = await supabase
    .from("accounts")
    .select("name")
    .eq("id", accountId)
    .single();

  const orgName = (account as any)?.name || "Organisation";
  const roleLabel = role === "admin" ? "Admin" : "Mitglied";

  const { data: invite, error: inviteError } = await supabase
    .from("invite_tokens")
    .insert({
      account_id: accountId,
      role,
      invited_by: inviterNormalized,
      invited_wallet: normalized,
      expires_at: new Date(
        Date.now() + expiresInDays * 24 * 60 * 60 * 1000
      ).toISOString(),
    })
    .select()
    .single();

  if (inviteError) throw inviteError;

  const inviteData = invite as InviteToken;

  const { data: notification, error: notifError } = await supabase
    .from("notifications")
    .insert({
      recipient_wallet: normalized,
      type: "org_invite",
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

  if (notifError) throw notifError;

  return { invite: inviteData, notification: notification as UserNotification };
}

/** Create a link invite: inserts invite_tokens row, returns token for URL. */
export async function createLinkInvite(
  accountId: string,
  role: "admin" | "member",
  invitedBy: string,
  expiresInDays = 7
): Promise<InviteToken> {
  const { data, error } = await supabase
    .from("invite_tokens")
    .insert({
      account_id: accountId,
      role,
      invited_by: invitedBy.toLowerCase(),
      invited_wallet: null,
      expires_at: new Date(
        Date.now() + expiresInDays * 24 * 60 * 60 * 1000
      ).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as InviteToken;
}

// ── Resolve ─────────────────────────────────────────────────────────

/** Accept an invite. */
export async function acceptInvite(
  inviteId: string,
  acceptingWallet: string
): Promise<void> {
  const normalized = acceptingWallet.toLowerCase();

  const { data: invite, error: fetchErr } = await supabase
    .from("invite_tokens")
    .select("*")
    .eq("id", inviteId)
    .single();

  if (fetchErr || !invite) throw new Error("Einladung nicht gefunden");

  const inv = invite as InviteToken;

  if (inv.status !== "pending")
    throw new Error("Diese Einladung ist nicht mehr gültig");

  if (new Date(inv.expires_at) < new Date()) {
    await supabase
      .from("invite_tokens")
      .update({ status: "expired" })
      .eq("id", inviteId);
    throw new Error("Diese Einladung ist abgelaufen");
  }

  await supabase
    .from("invite_tokens")
    .update({ status: "accepted" })
    .eq("id", inviteId);

  const { error: ownerErr } = await supabase
    .from("account_owners")
    .insert({
      account_id: inv.account_id,
      wallet_address: normalized,
      role: inv.role,
      invited_by: inv.invited_by,
    });

  if (ownerErr) throw ownerErr;

  if (inv.invited_wallet) {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("type", "org_invite")
      .contains("metadata", { invitation_id: inviteId } as any);
  }
}

/** Decline an invite. */
export async function declineInvite(inviteId: string): Promise<void> {
  await supabase
    .from("invite_tokens")
    .update({ status: "declined" })
    .eq("id", inviteId);

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("type", "org_invite")
    .contains("metadata", { invitation_id: inviteId } as any);
}

/** Revoke a pending invite (owner action). */
export async function revokeInvite(inviteId: string): Promise<void> {
  await supabase
    .from("invite_tokens")
    .update({ status: "revoked" })
    .eq("id", inviteId);

  await supabase
    .from("notifications")
    .delete()
    .eq("type", "org_invite")
    .contains("metadata", { invitation_id: inviteId } as any);
}

// ── Queries ─────────────────────────────────────────────────────────

/** Fetch pending invites for an account. */
export async function fetchPendingInvites(
  accountId: string
): Promise<InviteTokenWithUser[]> {
  const { data, error } = await supabase
    .from("invite_tokens")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return [];

  const invites = data as InviteToken[];

  const enriched: InviteTokenWithUser[] = await Promise.all(
    invites.map(async (inv) => {
      if (!inv.invited_wallet) return inv;

      const { data: userData } = await supabase
        .from("users")
        .select("username, profile_picture_url, tier")
        .eq("wallet_address", inv.invited_wallet)
        .maybeSingle();

      return { ...inv, invited_user: userData || undefined } as InviteTokenWithUser;
    })
  );

  return enriched;
}

/** Fetch an invite by its token. */
export async function fetchInviteByToken(
  token: string
): Promise<InviteTokenWithAccount | null> {
  const { data, error } = await supabase
    .from("invite_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) return null;

  const invite = data as InviteToken;

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", invite.account_id)
    .single();

  const { data: inviter } = await supabase
    .from("users")
    .select("username, profile_picture_url")
    .eq("wallet_address", invite.invited_by)
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
  const { data } = await supabase
    .from("invite_tokens")
    .select("id")
    .eq("account_id", accountId)
    .eq("invited_wallet", walletAddress.toLowerCase())
    .eq("status", "pending")
    .maybeSingle();

  return !!data;
}
