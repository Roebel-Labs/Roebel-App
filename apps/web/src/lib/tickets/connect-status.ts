import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripeConnect, isConnectLivemode } from "@/lib/stripe-connect";

export type ConnectStatus = {
  connected: boolean; stripe_account_id: string | null; details_submitted: boolean; charges_enabled: boolean;
  payouts_enabled: boolean; currently_due: string[]; disabled_reason: string | null; livemode: boolean;
};

export const EMPTY_STATUS: ConnectStatus = {
  connected: false, stripe_account_id: null, details_submitted: false, charges_enabled: false,
  payouts_enabled: false, currently_due: [], disabled_reason: null, livemode: false,
};

export function statusFromAccount(acct: Stripe.Account): ConnectStatus {
  return {
    connected: true, stripe_account_id: acct.id, details_submitted: !!acct.details_submitted,
    charges_enabled: !!acct.charges_enabled, payouts_enabled: !!acct.payouts_enabled,
    currently_due: acct.requirements?.currently_due ?? [], disabled_reason: acct.requirements?.disabled_reason ?? null,
    // Stripe's Account resource has no `livemode` field (unlike most other objects) — livemode is
    // implied by which secret key fetched it, so use the same helper the DB mirror row is keyed on.
    livemode: isConnectLivemode(),
  };
}

/** Load the org's mirror row (same livemode as the current key). */
export async function connectedAccountRow(admin: SupabaseClient, accountId: string) {
  const { data } = await admin
    .from("stripe_connected_accounts").select("*")
    .eq("account_id", accountId).eq("livemode", isConnectLivemode()).maybeSingle();
  return data as { stripe_account_id: string; charges_enabled: boolean } | null;
}

/** Fetch the account from Stripe and mirror it. Returns EMPTY_STATUS when the org has no account. */
export async function syncConnectedAccount(admin: SupabaseClient, accountId: string): Promise<ConnectStatus> {
  const row = await connectedAccountRow(admin, accountId);
  if (!row) return EMPTY_STATUS;
  const acct = await stripeConnect.accounts.retrieve(row.stripe_account_id);
  const status = statusFromAccount(acct);
  await admin.from("stripe_connected_accounts").update({
    details_submitted: status.details_submitted, charges_enabled: status.charges_enabled,
    payouts_enabled: status.payouts_enabled, requirements_currently_due: status.currently_due,
    disabled_reason: status.disabled_reason, updated_at: new Date().toISOString(),
  }).eq("stripe_account_id", row.stripe_account_id);
  return status;
}
