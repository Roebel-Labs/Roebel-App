import type { SupabaseClient } from "@supabase/supabase-js";

/** app_settings keys that gate the Stripe Connect ticket surfaces. */
export type TicketFlagKey = "stripe_tickets_enabled" | "stripe_connect_enabled";

/**
 * Server-side twin of the Expo gate in apps/expo/lib/supabase-app-settings.ts. The client
 * flag only hides a button — this one is the one that actually closes the route, so a rolled
 * back pilot cannot be re-opened by an old app build or a hand-crafted signed request.
 *
 * Both are NEW surfaces, so a missing key means OFF. Only an explicit 'true' opens the flag
 * to everyone; any other non-empty value is read as a comma-separated wallet allowlist
 * (compared lowercase). A read failure is treated as OFF: closed is the safe direction.
 */
export async function assertTicketsEnabled(
  admin: SupabaseClient,
  key: TicketFlagKey,
  wallet?: string,
): Promise<boolean> {
  let value: string | null = null;
  try {
    const { data, error } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (error) {
      console.error(`[tickets/flags] app_settings ${key} read failed`, error.message);
      return false;
    }
    value = typeof data?.value === "string" ? data.value.trim() : null;
  } catch (err) {
    console.error(`[tickets/flags] app_settings ${key} read threw`, err);
    return false;
  }
  if (!value || value === "false") return false;
  if (value === "true") return true;
  if (!wallet) return false;
  return value
    .toLowerCase()
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .includes(wallet.toLowerCase());
}
