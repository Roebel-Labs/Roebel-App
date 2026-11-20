"use client";

import { createContext, useContext } from "react";
import type { SigningAccount } from "@/lib/org-membership/client";

/** orgs_list entry (server: OrgListEntry in lib/credentials/actions.ts). */
export type CredentialOrg = {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  subType: string | null;
  role: "owner" | "admin";
  membersMayBePublic: boolean;
  onChain: "ready" | "org_not_registered" | "no_chain_authority";
};

export type CredentialsCtx = {
  account: SigningAccount;
  org: CredentialOrg;
  /** Re-reads orgs_list (after the members switch changed). */
  refreshOrg: () => Promise<void>;
};

export const CredentialsContext = createContext<CredentialsCtx | null>(null);

/** The signed-in account and the active org; only available below the credentials layout's gate. */
export function useCredentials(): CredentialsCtx {
  const v = useContext(CredentialsContext);
  if (!v) throw new Error("useCredentials outside the credentials layout");
  return v;
}

/** types_list row (server: TypeView in lib/credentials/actions.ts). */
export type CredentialTypeView = {
  typeId: string;
  name: string;
  kind: "role" | "membership" | "badge" | null;
  description: string | null;
  imageUrl: string | null;
  benefits: string[];
  template: string | null;
  publicClaim: boolean;
  supplyCap: number;
  claimStart: string | null;
  claimEnd: string | null;
  recognised: boolean;
  retired: boolean;
  chainStatus: "draft" | "onchain";
  counts?: { accepted: number; open: number };
};
