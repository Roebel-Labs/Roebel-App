/**
 * Account system types — unified account model
 * Matches Supabase accounts + account_owners tables (migrations 005, 007, 010, 011)
 */

// User tiers — unified role system
export type UserTier = "guest" | "tourist" | "citizen";

// Account types (migration 007 simplified to personal/organisation + sub_type)
export type AccountType = "personal" | "organisation";
export type OrgSubType = "restaurant" | "unternehmen" | "verein" | "partei" | "fraktion";
/** @deprecated Use OrgSubType instead */
export type OrgType = OrgSubType;

export interface Account {
  id: string;
  account_type: AccountType;
  sub_type: OrgSubType | null;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export type OrgRole = "owner" | "admin" | "member";

export interface AccountOwner {
  account_id: string;
  wallet_address: string;
  role: OrgRole;
  invited_by: string | null;
  joined_at: string;
}

// System account for legacy events
export const SYSTEM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

// ── Invite & notification types ─────────────────────────────────────

export type InviteTokenStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";

export interface InviteToken {
  id: string;
  account_id: string;
  role: "admin" | "member";
  invited_by: string;
  invited_wallet: string | null;
  token: string;
  status: InviteTokenStatus;
  expires_at: string;
  created_at: string;
}

export interface InviteTokenWithUser extends InviteToken {
  invited_user?: {
    username: string | null;
    profile_picture_url: string | null;
    tier: UserTier;
  };
}

export interface InviteTokenWithAccount extends InviteToken {
  account: Account;
  inviter?: {
    username: string | null;
    profile_picture_url: string | null;
  };
}

export interface UserNotification {
  id: string;
  recipient_wallet: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface MemberWithProfile extends AccountOwner {
  user: {
    username: string | null;
    profile_picture_url: string | null;
    tier: UserTier;
  };
}

// ── Labels ──────────────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  personal: "Persönlich",
  organisation: "Organisation",
};

export const SUB_TYPE_LABELS: Record<OrgSubType, string> = {
  restaurant: "Restaurant",
  unternehmen: "Unternehmen",
  verein: "Verein",
  partei: "Partei",
  fraktion: "Fraktion",
};

export const SUB_TYPE_EMOJI: Record<OrgSubType, string> = {
  restaurant: "🍽️",
  unternehmen: "🏢",
  verein: "🤝",
  partei: "🏛️",
  fraktion: "⚖️",
};

export function isOrgAccount(account: Account): boolean {
  return account.account_type === "organisation";
}
