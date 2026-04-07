/**
 * Account system Supabase operations
 * Adapted from apps/expo/lib/supabase-accounts.ts for the web app
 */

import { supabase } from "./supabase";
import type { Account, AccountOwner, OrgSubType } from "@/types/account";

// ── Fetch ────────────────────────────────────────────────────

export async function fetchAccountById(
  accountId: string
): Promise<Account | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (error) {
    console.error("fetchAccountById error:", error);
    return null;
  }
  return data as Account;
}

export async function fetchOwnedAccounts(
  walletAddress: string
): Promise<Account[]> {
  const { data, error } = await supabase
    .from("account_owners")
    .select("account_id, accounts:account_id(*)")
    .eq("wallet_address", walletAddress.toLowerCase());

  if (error) {
    console.error("fetchOwnedAccounts error:", error);
    return [];
  }

  return (data as any[])
    .map((row) => row.accounts)
    .filter(Boolean) as Account[];
}

export async function fetchAccountOwners(
  accountId: string
): Promise<AccountOwner[]> {
  const { data, error } = await supabase
    .from("account_owners")
    .select("*")
    .eq("account_id", accountId);

  if (error) {
    console.error("fetchAccountOwners error:", error);
    return [];
  }
  return data as AccountOwner[];
}

export async function isAccountOwner(
  accountId: string,
  walletAddress: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("account_owners")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("wallet_address", walletAddress.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("isAccountOwner error:", error);
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

  const { data: account, error: accError } = await supabase
    .from("accounts")
    .insert({
      account_type: "personal",
      name,
      avatar_url: avatarUrl || null,
    })
    .select()
    .single();

  if (accError) {
    console.error("createPersonalAccount error:", accError);
    return null;
  }

  const acc = account as Account;

  // Link owner
  const { error: ownerError } = await supabase
    .from("account_owners")
    .insert({
      account_id: acc.id,
      wallet_address: normalized,
    });

  if (ownerError) {
    console.error("createPersonalAccount owner link error:", ownerError);
  }

  // Set as active account
  await supabase
    .from("users")
    .update({ active_account_id: acc.id })
    .eq("wallet_address", normalized);

  return acc;
}

export async function createOrgAccount(
  walletAddress: string,
  subType: OrgSubType,
  name: string
): Promise<Account | null> {
  const normalized = walletAddress.toLowerCase();

  const { data: account, error: accError } = await supabase
    .from("accounts")
    .insert({
      account_type: "organisation",
      sub_type: subType,
      name,
    })
    .select()
    .single();

  if (accError) {
    console.error("createOrgAccount error:", accError);
    return null;
  }

  const acc = account as Account;

  // Link creator as owner
  const { error: ownerError } = await supabase
    .from("account_owners")
    .insert({
      account_id: acc.id,
      wallet_address: normalized,
    });

  if (ownerError) {
    console.error("createOrgAccount owner link error:", ownerError);
  }

  return acc;
}

// ── Switch ───────────────────────────────────────────────────

export async function switchActiveAccount(
  walletAddress: string,
  accountId: string
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ active_account_id: accountId })
    .eq("wallet_address", walletAddress.toLowerCase());

  if (error) {
    console.error("switchActiveAccount error:", error);
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
    .from("account_owners")
    .insert({
      account_id: accountId,
      wallet_address: walletAddress.toLowerCase(),
      invited_by: invitedBy.toLowerCase(),
    });

  if (error) {
    console.error("inviteOwner error:", error);
    throw error;
  }
}

export async function removeOwner(
  accountId: string,
  walletAddress: string
): Promise<void> {
  // Prevent removing the last owner
  const owners = await fetchAccountOwners(accountId);
  if (owners.length <= 1) {
    throw new Error("Cannot remove the last owner of an account");
  }

  const { error } = await supabase
    .from("account_owners")
    .delete()
    .eq("account_id", accountId)
    .eq("wallet_address", walletAddress.toLowerCase());

  if (error) {
    console.error("removeOwner error:", error);
    throw error;
  }
}

// ── Update ───────────────────────────────────────────────────

export async function updateAccount(
  accountId: string,
  updates: Partial<Pick<Account, "name" | "bio" | "avatar_url" | "cover_url">>
): Promise<Account | null> {
  const { data, error } = await supabase
    .from("accounts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", accountId)
    .select()
    .single();

  if (error) {
    console.error("updateAccount error:", error);
    throw error;
  }
  return data as Account;
}
