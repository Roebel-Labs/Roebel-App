import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { failResponse, jsonFail, jsonOk, verifySignedRequest } from "@/lib/signed-request/verify";
import { BOOKING_SCOPE, type BookingAction } from "@/lib/signed-request/message";
import { CalendlyError, activeEventTypes, type SellerConfig } from "@/lib/booking/calendly";

export const dynamic = "force-dynamic";
const ACTIONS: readonly BookingAction[] = ["booking_connect", "booking_disconnect"];

/** user_uuid from a Calendly personal access token (JWT payload); the token itself is checked against the API. */
function calendlyUserUuid(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { user_uuid?: unknown };
    return typeof json.user_uuid === "string" && /^[0-9a-f-]{36}$/i.test(json.user_uuid) ? json.user_uuid : null;
  } catch {
    return null;
  }
}

// POST signed (scope roebel-booking-v1), always for the signing wallet's own personal account:
//   booking_connect    { token } → { connected: true, event_types }   validates the Calendly token, stores it server-side
//   booking_disconnect {}        → { connected: false }               switches booking off on every own listing
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest<BookingAction>(await request.json().catch(() => null), {
    scope: BOOKING_SCOPE, actions: ACTIONS, headers: request.headers,
  });
  if (!v.ok) return failResponse(v);
  const admin = createAdminClient();

  if (v.action === "booking_disconnect") {
    await admin.from("booking_calendly").update({ enabled: false, calendly_token: "", updated_at: new Date().toISOString() }).eq("seller_wallet", v.wallet);
    await admin.from("marketplace_listings").update({ booking_event_type_uri: null }).eq("seller_wallet_address", v.wallet);
    return jsonOk({ connected: false });
  }

  const token = typeof v.payload.token === "string" ? v.payload.token.trim() : "";
  const uuid = token.length > 40 && token.length < 4000 ? calendlyUserUuid(token) : null;
  if (!uuid) return jsonFail(400, "BAD_TOKEN", "Das sieht nicht wie ein Calendly-Zugangsschlüssel aus.");

  const { data: owners } = await admin.from("account_owners")
    .select("account_id, accounts:account_id(account_type)").eq("wallet_address", v.wallet);
  const personal = (owners as { account_id: string; accounts: { account_type: string } | null }[] | null)
    ?.find((o) => o.accounts?.account_type === "personal")?.account_id;
  if (!personal) return jsonFail(404, "NO_ACCOUNT", "Kein persönliches Konto gefunden.");

  const cfg: SellerConfig = {
    seller_wallet: v.wallet, seller_account_id: personal, calendly_token: token,
    calendly_user_uri: `https://api.calendly.com/users/${uuid}`, auto_reply: null,
  };
  let types;
  try {
    types = await activeEventTypes(cfg);
  } catch (err) {
    const status = err instanceof CalendlyError ? err.status : 0;
    return jsonFail(400, "TOKEN_REJECTED", status === 401
      ? "Calendly kennt diesen Schlüssel nicht (abgelaufen oder gelöscht)."
      : "Der Schlüssel braucht mindestens die Rechte „event_types:read“ und „availability:read“.");
  }

  const { error } = await admin.from("booking_calendly").upsert({
    seller_wallet: v.wallet, seller_account_id: personal, calendly_token: token,
    calendly_user_uri: cfg.calendly_user_uri, enabled: true, updated_at: new Date().toISOString(),
  }, { onConflict: "seller_wallet" });
  if (error) return jsonFail(500, "DB_ERROR", "Konnte nicht gespeichert werden.");
  return jsonOk({
    connected: true,
    event_types: types.map((t) => ({ uri: t.uri, name: t.name, duration: t.duration, description: t.description, location_kind: t.location_kind, question: t.question })),
  });
}
