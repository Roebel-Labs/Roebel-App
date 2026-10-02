import { jsonFail, jsonOk } from "@/lib/signed-request/verify";

export const dynamic = "force-dynamic";

// GET → { townPubkey }: the town key person-signed Vorhaben actions address their objects under (NSP-13 Stage 2).
// Public: the key is already in every published event. 503 when unset — the app then keeps the legacy signed request.
export function GET() {
  const town = (process.env.VORHABEN_TOWN_PUBKEY ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(town)) {
    return jsonFail(503, "FEATURE_OFF", "Signierte Nostr-Aktionen sind auf diesem Server nicht eingerichtet (VORHABEN_TOWN_PUBKEY fehlt).");
  }
  return jsonOk({ townPubkey: town });
}
