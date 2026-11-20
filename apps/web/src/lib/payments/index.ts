import type { SupabaseClient } from "@supabase/supabase-js";
import { connectedAccountRow } from "@/lib/tickets/connect-status";
import { isConnectConfigured } from "@/lib/stripe-connect";
import { mollieAccountRow, mollieProvider } from "./mollie/provider";
import { isMollieConfigured } from "./mollie/client";
import { stripeProvider } from "./stripe-provider";
import type { PaymentProvider, PaymentProviderId } from "./types";

export * from "./types";
export { platformFeeCents, clampMollieApplicationFee } from "./fees";

export function getProvider(id: PaymentProviderId): PaymentProvider {
  return id === "mollie" ? mollieProvider : stripeProvider;
}

/**
 * True unless the app_settings key is missing, empty or 'false'. Used where no org wallet is at
 * hand (a buyer's checkout): an allowlisted pilot counts as on, because the org that connected
 * Mollie was let in by that allowlist. Read failure = off (closed is the safe direction).
 */
export async function flagIsOn(admin: SupabaseClient, key: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (error) return false;
    const v = typeof data?.value === "string" ? data.value.trim() : "";
    return v !== "" && v !== "false";
  } catch {
    return false;
  }
}

/**
 * Which rail takes an org's next payment. Rule (M1, deliberately simple, no per-org preference):
 * **Mollie wins when the org has an active Mollie account** (mollie_enabled not off, payments
 * enabled); otherwise an active Stripe account; otherwise none. An org with both connected
 * therefore sells on Mollie — switching back to Stripe means disconnecting Mollie (M2 may add
 * an explicit `preferred` column if anyone needs both).
 */
export async function resolveCheckoutProvider(admin: SupabaseClient, accountId: string): Promise<PaymentProviderId | null> {
  if (isMollieConfigured() && (await flagIsOn(admin, "mollie_enabled"))) {
    const m = await mollieAccountRow(admin, accountId);
    if (m?.charges_enabled && m.profile_id) return "mollie";
  }
  if (isConnectConfigured()) {
    const s = await connectedAccountRow(admin, accountId);
    if (s?.charges_enabled) return "stripe";
  }
  return null;
}
