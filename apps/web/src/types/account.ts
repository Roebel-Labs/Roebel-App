/**
 * Account system types — unified account model
 * Matches Supabase accounts + account_owners tables (migration 005)
 */

// User tiers — unified role system (replaces old UserRole)
export type UserTier = "guest" | "tourist" | "citizen";

// Account types
export type AccountType =
  | "personal"
  | "unternehmen"
  | "verein"
  | "partei"
  | "fraktion";

export type OrgType = Exclude<AccountType, "personal">;

export interface Account {
  id: string;
  account_type: AccountType;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountOwner {
  account_id: string;
  wallet_address: string;
  role: "owner";
  invited_by: string | null;
  joined_at: string;
}

// System account for legacy events
export const SYSTEM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

// German labels for account types
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  personal: "Persönlich",
  unternehmen: "Unternehmen",
  verein: "Verein",
  partei: "Partei",
  fraktion: "Fraktion",
};

export function isOrgAccount(account: Account): boolean {
  return account.account_type !== "personal";
}
