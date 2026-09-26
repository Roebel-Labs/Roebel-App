import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeConnect, isConnectLivemode, webBaseUrl } from "@/lib/stripe-connect";
import { connectedAccountRow, statusFromAccount } from "@/lib/tickets/connect-status";

export type EnsureAccountResult =
  | { ok: true; stripeAccountId: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Return the org's Stripe connected account id for the current mode, creating it on first use.
 * Shape (assessment §8.0): full dashboard, Stripe collects fees, carries losses and collects
 * requirements. The caller must already have verified the signer is owner/admin of the org.
 */
export async function ensureConnectedAccount(
  admin: SupabaseClient, accountId: string, wallet: string,
): Promise<EnsureAccountResult> {
  const existing = await connectedAccountRow(admin, accountId);
  if (existing) return { ok: true, stripeAccountId: existing.stripe_account_id };

  const { data: org } = await admin.from("accounts").select("id, name, contact_email, slug, sub_type").eq("id", accountId).maybeSingle();
  if (!org) return { ok: false, status: 404, code: "NOT_FOUND", message: "Organisation nicht gefunden" };

  let acct;
  try {
    acct = await stripeConnect.accounts.create({
      country: "DE",
      email: org.contact_email ?? undefined,
      business_type: org.sub_type === "verein" ? "non_profit" : undefined,
      controller: {
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        stripe_dashboard: { type: "full" },
        requirement_collection: "stripe",
      },
      // Stripe refuses card_payments without transfers on connected accounts
      // ("Accounts do not currently support `card_payments` without `transfers`").
      // transfers is never used by us (direct charges only), it is a Stripe prerequisite.
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: {
        name: org.name,
        url: org.slug ? `${webBaseUrl()}/org/${org.slug}` : undefined,
        product_description: "Eintrittskarten und Gebühren für Veranstaltungen in Röbel/Müritz",
      },
      metadata: { roebel_account_id: accountId },
    });
  } catch (err) {
    return { ok: false, status: 502, code: "STRIPE_ERROR", message: err instanceof Error ? err.message : "Stripe-Fehler" };
  }

  const status = statusFromAccount(acct);
  const { error } = await admin.from("stripe_connected_accounts").insert({
    account_id: accountId,
    stripe_account_id: acct.id,
    livemode: isConnectLivemode(),
    dashboard_type: "full",
    created_by_wallet: wallet,
    details_submitted: status.details_submitted,
    charges_enabled: status.charges_enabled,
    payouts_enabled: status.payouts_enabled,
    disabled_reason: status.disabled_reason,
    requirements_currently_due: acct.requirements?.currently_due ?? [],
  });
  if (error) {
    try {
      await stripeConnect.accounts.del(acct.id);
      console.error("[connect] account insert failed; deleted the new Stripe account", acct.id, "for org", accountId);
    } catch (delErr) {
      console.error("[connect] ORPHANED Stripe account", acct.id, "for org", accountId, delErr);
    }
    return { ok: false, status: 500, code: "DB_ERROR", message: error.message };
  }
  return { ok: true, stripeAccountId: acct.id };
}
